import { useState } from 'react'
import { db, type Profile, type WeightLog } from '../lib/db'
import { avg7, bmi, bmiLabel, fmt1, latestWeight } from '../lib/calc'
import { addDays } from '../lib/date'

type Slot = 'morningKg' | 'eveningKg'

export default function WeightCard({ date, weights, profile }: { date: string; weights: WeightLog[]; profile: Profile }) {
  const [editing, setEditing] = useState<Slot | null>(null)
  const [value, setValue] = useState('')
  const log = weights.find((w) => w.date === date)

  const yesterday = weights.find((w) => w.date === addDays(date, -1))?.morningKg
  const avg = avg7(weights, date, addDays)
  const current = latestWeight(weights, date) ?? profile.startWeight
  const toGoal = current - profile.goalWeight
  const lost = profile.startWeight - current
  const b = bmi(current, profile.heightCm)

  function open(slot: Slot) {
    setEditing(slot)
    setValue(log?.[slot] ? String(log[slot]) : '')
  }

  async function save() {
    if (!editing) return
    const n = Number(value)
    const next: WeightLog = { ...(log ?? { date }), date }
    if (value.trim() === '') delete next[editing]
    else if (n >= 30 && n <= 300) next[editing] = Math.round(n * 10) / 10
    else return
    if (next.morningKg || next.eveningKg) await db.weights.put(next)
    else await db.weights.delete(date)
    setEditing(null)
  }

  return (
    <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">⚖️ น้ำหนัก</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(['morningKg', 'eveningKg'] as const).map((slot) => (
          <button
            key={slot}
            onClick={() => open(slot)}
            className={`rounded-xl border p-3 text-left ${editing === slot ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}
          >
            <div className="text-xs text-slate-500">{slot === 'morningKg' ? '🌅 เช้า (หลังตื่นนอน)' : '🌙 เย็น / ก่อนนอน'}</div>
            <div className="text-xl font-semibold">
              {log?.[slot] ? `${fmt1(log[slot]!)} กก.` : <span className="text-base font-normal text-emerald-700">+ บันทึก</span>}
            </div>
          </button>
        ))}
      </div>

      {editing && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="เช่น 68.4"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus:border-emerald-500"
          />
          <button onClick={save} className="rounded-xl bg-emerald-600 px-4 font-semibold text-white">บันทึก</button>
          <button onClick={() => setEditing(null)} className="rounded-xl px-2 text-slate-500">ยกเลิก</button>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
        {log?.morningKg && yesterday && (
          <Row label="เทียบเช้าเมื่อวาน" value={diff(log.morningKg - yesterday)} />
        )}
        {log?.morningKg && log?.eveningKg && (
          <Row label="เช้า → เย็น" value={diff(log.eveningKg - log.morningKg)} />
        )}
        {avg && <Row label={`เฉลี่ยเช้า 7 วัน (${avg.count} วัน)`} value={`${fmt1(avg.value)} กก.`} />}
        <Row label="ลดไปแล้ว" value={`${fmt1(lost)} กก.`} />
        <Row label="เหลืออีก" value={toGoal > 0 ? `${fmt1(toGoal)} กก.` : 'ถึงเป้าแล้ว 🎉'} />
        <Row label="BMI" value={`${fmt1(b)} (${bmiLabel(b)})`} />
      </dl>
      <p className="mt-2 text-[11px] text-slate-400">
        น้ำหนักเย็นมักมากกว่าเช้า 0.5–1.5 กก. จากน้ำและอาหาร ใช้น้ำหนักเช้าดูแนวโน้มจะแม่นกว่า
      </p>
    </section>
  )
}

const diff = (d: number) => `${d > 0 ? '+' : ''}${fmt1(d)} กก.`

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}
