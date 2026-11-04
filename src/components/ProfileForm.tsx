import { useState } from 'react'
import { db, type Activity, type Profile, type Sex } from '../lib/db'
import { ACTIVITY, RATES, ageOf, bmi, bmiLabel, calorieTarget, fmt1, fmtInt, KCAL_PER_KG } from '../lib/calc'
import { todayStr } from '../lib/date'
import type { MeasuredBmr } from '../lib/calc'

const input =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'

export default function ProfileForm({ profile, currentWeight, measured, onSaved }: {
  profile?: Profile
  currentWeight?: number
  measured?: MeasuredBmr
  onSaved?: () => void
}) {
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'female')
  const [age, setAge] = useState(profile ? String(ageOf(profile.birthYear)) : '')
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : '')
  const [start, setStart] = useState(profile ? String(profile.startWeight) : '')
  const [goal, setGoal] = useState(profile ? String(profile.goalWeight) : '')
  const [activity, setActivity] = useState<Activity>(profile?.activity ?? 'sedentary')
  const [rate, setRate] = useState(profile?.ratePerWeek ?? 0.5)
  const [error, setError] = useState('')

  const nAge = Number(age), nHeight = Number(height), nStart = Number(start), nGoal = Number(goal)
  const valid = nAge >= 10 && nAge <= 100 && nHeight >= 100 && nHeight <= 250 && nStart >= 30 && nStart <= 300 && nGoal >= 30 && nGoal <= 300

  const draft: Profile | null = valid
    ? {
        id: 'me',
        sex,
        birthYear: new Date().getFullYear() - nAge,
        heightCm: nHeight,
        startWeight: nStart,
        goalWeight: nGoal,
        activity,
        ratePerWeek: rate,
        createdAt: profile?.createdAt ?? todayStr(),
        ...(profile?.useScanBmr ? { useScanBmr: true } : {}),
      }
    : null

  const calcWeight = currentWeight ?? nStart
  const preview = draft ? calorieTarget(draft, calcWeight, measured) : null
  // ใช้ส่วนต่างแคลจริง (กรณีเป้าถูกปัดขึ้นเป็นขั้นต่ำ จะลดช้ากว่าที่เลือก)
  const realDeficit = preview ? preview.tdee - preview.target : 0
  const weeks = preview && calcWeight > nGoal && realDeficit > 0 ? ((calcWeight - nGoal) * KCAL_PER_KG) / (realDeficit * 7) : 0

  async function save() {
    if (!draft) return setError('กรุณากรอกข้อมูลให้ครบและถูกต้อง')
    if (nGoal >= nStart && !profile) return setError('น้ำหนักเป้าหมายควรน้อยกว่าน้ำหนักปัจจุบัน')
    await db.transaction('rw', db.profile, db.weights, async () => {
      if (!profile) {
        // ครั้งแรก: บันทึกน้ำหนักตอนนี้เป็นน้ำหนักเช้าของวันนี้ด้วย
        const today = todayStr()
        const existing = await db.weights.get(today)
        if (!existing?.morningKg) await db.weights.put({ ...existing, date: today, morningKg: nStart })
      }
      await db.profile.put(draft)
    })
    setError('')
    onSaved?.()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">เพศ</label>
        <div className="grid grid-cols-2 gap-2">
          {(['female', 'male'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSex(s)}
              className={`rounded-xl border py-2.5 ${sex === s ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700' : 'border-slate-300 bg-white text-slate-600'}`}
            >
              {s === 'female' ? 'หญิง' : 'ชาย'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="อายุ (ปี)"><input className={input} inputMode="numeric" type="number" value={age} onChange={(e) => setAge(e.target.value)} /></Field>
        <Field label="ส่วนสูง (ซม.)"><input className={input} inputMode="decimal" type="number" value={height} onChange={(e) => setHeight(e.target.value)} /></Field>
        <Field label={profile ? 'น้ำหนักเริ่มต้น (กก.)' : 'น้ำหนักตอนนี้ (กก.)'}><input className={input} inputMode="decimal" type="number" step="0.1" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="น้ำหนักเป้าหมาย (กก.)"><input className={input} inputMode="decimal" type="number" step="0.1" value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
      </div>

      <Field label="ระดับกิจกรรมในแต่ละวัน">
        <select className={input} value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
          {Object.entries(ACTIVITY).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </Field>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">ความเร็วในการลดน้ำหนัก</label>
        <div className="grid grid-cols-3 gap-2">
          {RATES.map((r) => (
            <button
              key={r}
              onClick={() => setRate(r)}
              className={`rounded-xl border py-2 text-sm ${rate === r ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700' : 'border-slate-300 bg-white text-slate-600'}`}
            >
              {r} กก./สัปดาห์
              <div className="text-[11px] font-normal text-slate-500">
                {r === 0.25 ? 'สบายๆ' : r === 0.5 ? 'แนะนำ' : 'เข้มข้น'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-slate-700">
          <div className="flex items-baseline justify-between">
            <span>เป้าหมายแคลอรี่ต่อวัน</span>
            <span className="text-2xl font-bold text-emerald-700">{fmtInt(preview.target)} kcal</span>
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
            <li>BMR (พลังงานที่ร่างกายใช้ขณะพัก): {fmtInt(preview.bmr)} kcal{preview.bmrSource === 'measured' && ' (จากเครื่องวัด)'}</li>
            <li>TDEE (พลังงานที่ใช้ทั้งวัน): {fmtInt(preview.tdee)} kcal</li>
            <li>กินน้อยกว่า TDEE วันละ {fmtInt(realDeficit)} kcal (ไขมัน 1 กก. ≈ {fmtInt(KCAL_PER_KG)} kcal)</li>
            <li>BMI ตอนนี้: {fmt1(bmi(calcWeight, nHeight))} ({bmiLabel(bmi(calcWeight, nHeight))})</li>
            {weeks > 0 && <li>ถ้าทำได้ตามแผน จะถึงเป้าในประมาณ {Math.ceil(weeks)} สัปดาห์</li>}
          </ul>
          {preview.floored && (
            <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-800">
              ⚠️ ตั้งเป้าไว้ไม่ต่ำกว่า {sex === 'male' ? '1,500' : '1,200'} kcal เพื่อความปลอดภัย จึงอาจลดได้ช้ากว่าที่เลือก
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={!valid}
        className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:bg-slate-300"
      >
        {profile ? 'บันทึกการเปลี่ยนแปลง' : 'เริ่มใช้งาน'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}
