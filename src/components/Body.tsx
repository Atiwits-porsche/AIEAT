import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BodyScan, type Profile } from '../lib/db'
import { ageOf, bmr as formulaBmr, calorieTarget, fmt1, fmtInt, latestWeight } from '../lib/calc'
import { formatThaiDate, todayStr } from '../lib/date'
import {
  bmiScale, bodyInsights, derive, ecwScale, fatScale, goals, tbwScale, visceralScale, type Derived,
} from '../lib/body'
import RangeBar from './RangeBar'
import { WaistCard } from './Indicators'

export default function Body({ profile }: { profile: Profile }) {
  const scans = useLiveQuery(() => db.bodyScans.orderBy('date').reverse().toArray(), [])
  const [editing, setEditing] = useState<BodyScan | 'new' | null>(null)
  if (!scans) return null

  const list = scans.map((s) => derive(s, profile.heightCm))
  const cur = list[0]
  const prev = list[1]

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">องค์ประกอบร่างกาย</h1>
        <button onClick={() => setEditing('new')} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">+ เพิ่มผลวัด</button>
      </div>

      <WaistCard profile={profile} />

      {!cur ? (
        <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-4xl">🧬</div>
          <p className="mt-2 font-semibold">ยังไม่มีผลวัด</p>
          <p className="mt-1 text-sm text-slate-500">
            กรอกค่าจากใบผลเครื่องวัดองค์ประกอบร่างกาย (เช่น Tanita, InBody) เพื่อดู %ไขมัน ไขมันช่องท้อง น้ำในร่างกาย
            และคำนวณว่าต้องลดไขมันอีกเท่าไหร่
          </p>
          <button onClick={() => setEditing('new')} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white">กรอกผลวัดครั้งแรก</button>
        </section>
      ) : (
        <>
          <Overview d={cur} profile={profile} />
          <Goals d={cur} profile={profile} />
          {prev && <Compare cur={cur} prev={prev} />}
          <Insights d={cur} prev={prev} profile={profile} />
          <BmrCard d={cur} profile={profile} />
          <History list={list} onEdit={(d) => setEditing(scans.find((s) => s.id === d.id) ?? null)} />
        </>
      )}

      {editing && (
        <ScanForm
          profile={profile}
          scan={editing === 'new' ? undefined : editing}
          last={scans[0]}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Overview({ d, profile }: { d: Derived; profile: Profile }) {
  const age = ageOf(profile.birthYear)
  const fatW = (d.fatMass / d.weight) * 100
  return (
    <Card title="📋 ผลวัดล่าสุด" right={<span className="text-xs text-slate-500">{formatThaiDate(d.date)}{d.device ? ` · ${d.device}` : ''}</span>}>
      {/* น้ำหนัก = ไขมัน + มวลไร้ไขมัน */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-600">น้ำหนักรวม</span>
        <span className="text-2xl font-bold">{fmt1(d.weight)} <span className="text-sm font-normal text-slate-500">กก.</span></span>
      </div>
      <div className="mt-2 flex h-7 gap-[2px] overflow-hidden rounded-lg text-[11px] font-medium text-white">
        <div className="flex items-center justify-center bg-[#eb6834]" style={{ width: `${fatW}%` }}>ไขมัน {fmt1(d.fatMass)}</div>
        <div className="flex flex-1 items-center justify-center bg-[#2a78d6]">มวลไร้ไขมัน {fmt1(d.ffm)}</div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{fmt1(fatW)}% ของน้ำหนัก</span>
        {d.muscleMass !== undefined && <span>ในนี้เป็นกล้ามเนื้อ {fmt1(d.muscleMass)} กก.</span>}
      </div>

      <div className="mt-5 space-y-5">
        <RangeBar label="% ไขมันในร่างกาย" value={d.fatPct} unit="%" scale={fatScale(profile.sex, age)}
          sub={`เกณฑ์สำหรับ${profile.sex === 'male' ? 'ชาย' : 'หญิง'}อายุ ${age} ปี`} />
        {d.visceralFat !== undefined && (
          <RangeBar label="ไขมันในช่องท้อง" value={d.visceralFat} unit="ระดับ" digits={0} scale={visceralScale} ticks={[1, 13, 18, 25]} />
        )}
        {d.bmi !== undefined && <RangeBar label="ดัชนีมวลกาย (BMI)" value={d.bmi} unit="" scale={bmiScale} />}
        {d.tbwPct !== undefined && (
          <RangeBar label="น้ำในร่างกาย (TBW)" value={d.tbwPct} unit="%" scale={tbwScale(profile.sex)}
            sub={d.tbwKg !== undefined ? `${fmt1(d.tbwKg)} กก.${d.ecwKg !== undefined && d.icwKg !== undefined ? ` · นอกเซลล์ ${fmt1(d.ecwKg)} · ในเซลล์ ${fmt1(d.icwKg)} กก.` : ''}` : undefined} />
        )}
        {d.ecwTbwPct !== undefined && (
          <RangeBar label="น้ำนอกเซลล์ / น้ำทั้งหมด (ECW/TBW)" value={d.ecwTbwPct} unit="%" scale={ecwScale} ticks={[35, 40, 45]}
            sub="แต่ละยี่ห้อเครื่องวัดให้ค่าต่างกัน ใช้เทียบกับครั้งก่อนของตัวเอง ถ้าเพิ่มขึ้นต่อเนื่องอาจมาจากการบวมน้ำ อักเสบ หรือออกกำลังหนักก่อนวัด" />
        )}
      </div>

      {(d.metabolicAge !== undefined || d.bmrKcal !== undefined) && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {d.metabolicAge !== undefined && (
            <Mini label="อายุเมตาบอลิซึม" value={`${d.metabolicAge} ปี`}
              sub={d.metabolicAge > age ? `มากกว่าอายุจริง ${d.metabolicAge - age} ปี` : d.metabolicAge < age ? `น้อยกว่าอายุจริง ${age - d.metabolicAge} ปี` : 'เท่าอายุจริง'}
              tone={d.metabolicAge > age ? 'warn' : 'good'} />
          )}
          {d.bmrKcal !== undefined && <Mini label="BMR จากเครื่อง" value={`${fmtInt(d.bmrKcal)} kcal`} sub="พลังงานขณะพัก" />}
        </div>
      )}
    </Card>
  )
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </div>
  )
}

function Goals({ d, profile }: { d: Derived; profile: Profile }) {
  const g = goals(d, profile)
  return (
    <Card title="🎯 เป้าหมายจากองค์ประกอบร่างกาย">
      <div className="grid grid-cols-2 gap-2">
        <Mini label="ไขมันที่ควรลด" value={g.fatToLose > 0 ? `${fmt1(g.fatToLose)} กก.` : 'ถึงเกณฑ์แล้ว'} sub={`ให้ %ไขมันเหลือ ≤ ${g.range.high}%`} tone={g.fatToLose > 0 ? undefined : 'good'} />
        <Mini label="น้ำหนักที่ %ไขมันเหมาะสม" value={`≈ ${fmt1(g.healthyWeight)} กก.`} sub="ถ้ารักษากล้ามเนื้อไว้เท่าเดิม" />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
        <li>
          • ถ้าลดถึงเป้า <b>{fmt1(g.goalWeight)} กก.</b> โดยไม่เสียกล้ามเนื้อ %ไขมันจะเหลือประมาณ <b>{fmt1(Math.max(0, g.atGoalFatPct))}%</b>
          {g.goalTooLow && <span className="text-amber-700"> — ต่ำกว่าเกณฑ์ อาจต้องเสียกล้ามเนื้อ ลองตั้งเป้าใกล้ {fmt1(g.healthyWeight)} กก.</span>}
        </li>
        <li>• โปรตีนที่ควรได้ต่อวันเพื่อรักษากล้ามเนื้อระหว่างลดน้ำหนัก: <b>{g.proteinLo}–{g.proteinHi} กรัม</b> (1.6–2.2 ก./กก. มวลไร้ไขมัน)</li>
      </ul>
    </Card>
  )
}

const ROWS: { label: string; key: keyof Derived; unit: string; better: 'down' | 'up' | 'none'; digits?: number }[] = [
  { label: 'น้ำหนัก', key: 'weight', unit: 'กก.', better: 'down' },
  { label: '% ไขมัน', key: 'fatPct', unit: '%', better: 'down' },
  { label: 'มวลไขมัน', key: 'fatMass', unit: 'กก.', better: 'down' },
  { label: 'มวลไร้ไขมัน', key: 'ffm', unit: 'กก.', better: 'up' },
  { label: 'มวลกล้ามเนื้อ', key: 'muscleMass', unit: 'กก.', better: 'up' },
  { label: 'ไขมันช่องท้อง', key: 'visceralFat', unit: '', better: 'down', digits: 0 },
  { label: 'อายุเมตาบอลิซึม', key: 'metabolicAge', unit: 'ปี', better: 'down', digits: 0 },
  { label: 'น้ำในร่างกาย', key: 'tbwPct', unit: '%', better: 'up' },
  { label: 'ECW/TBW', key: 'ecwTbwPct', unit: '%', better: 'none' },
]

function Compare({ cur, prev }: { cur: Derived; prev: Derived }) {
  return (
    <Card title="↔️ เทียบกับครั้งก่อน" right={<span className="text-xs text-slate-500">{formatThaiDate(prev.date)}</span>}>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500">
          <tr><th className="py-1 text-left font-medium"></th><th className="text-right font-medium">ก่อน</th><th className="text-right font-medium">ล่าสุด</th><th className="text-right font-medium">เปลี่ยน</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ROWS.map((r) => {
            const a = prev[r.key] as number | undefined, b = cur[r.key] as number | undefined
            if (a === undefined || b === undefined) return null
            const dv = b - a
            const dg = r.digits ?? 1
            const good = r.better === 'none' || Math.abs(dv) < 0.05 ? null : (r.better === 'down') === (dv < 0)
            return (
              <tr key={r.key}>
                <td className="py-1.5">{r.label}</td>
                <td className="text-right text-slate-500">{a.toFixed(dg)}</td>
                <td className="text-right font-medium">{b.toFixed(dg)}</td>
                <td className={`text-right ${good === null ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-red-600'}`}>
                  {dv > 0 ? '+' : ''}{dv.toFixed(dg)}{r.unit && ` ${r.unit}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function Insights({ d, prev, profile }: { d: Derived; prev?: Derived; profile: Profile }) {
  const notes = bodyInsights(d, prev, profile)
  if (!notes.length) return null
  return (
    <Card title="💡 วิเคราะห์">
      <ul className="space-y-2">
        {notes.map((n, i) => (
          <li key={i} className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${
            n.tone === 'good' ? 'bg-emerald-50 text-emerald-900' : n.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'
          }`}>
            <span>{n.icon}</span><span>{n.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-400">ข้อมูลนี้เป็นแนวทางทั่วไป ไม่ใช่คำวินิจฉัยทางการแพทย์</p>
    </Card>
  )
}

function BmrCard({ d, profile }: { d: Derived; profile: Profile }) {
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? []
  if (d.bmrKcal === undefined) return null
  const w = latestWeight(weights, todayStr()) ?? d.weight
  const formula = Math.round(formulaBmr(profile, w))
  const adjusted = Math.round(d.bmrKcal + 10 * (w - d.weight))
  const tF = calorieTarget(profile, w)
  const tM = calorieTarget(profile, w, { kcal: d.bmrKcal, weight: d.weight })
  return (
    <Card title="🔥 ใช้ BMR จากเครื่องวัด">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2">
          <div className="text-xs text-slate-500">จากสูตร</div>
          <div className="font-bold">{fmtInt(formula)} kcal</div>
          <div className="text-[11px] text-slate-500">เป้าแคล {fmtInt(tF.target)}/วัน</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <div className="text-xs text-slate-500">จากเครื่อง (ปรับตามน้ำหนักล่าสุด)</div>
          <div className="font-bold">{fmtInt(adjusted)} kcal</div>
          <div className="text-[11px] text-slate-500">เป้าแคล {fmtInt(tM.target)}/วัน</div>
        </div>
      </div>
      {tF.floored && tM.floored && (
        <p className="mt-2 text-[11px] text-amber-700">ทั้งสองแบบได้เป้าเท่ากัน เพราะติดขั้นต่ำ {profile.sex === 'male' ? '1,500' : '1,200'} kcal เพื่อความปลอดภัย</p>
      )}
      <label className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span>ใช้ BMR จากเครื่องวัดคำนวณเป้าแคลต่อวัน</span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-emerald-600"
          checked={!!profile.useScanBmr}
          onChange={(e) => db.profile.update('me', { useScanBmr: e.target.checked })}
        />
      </label>
      <p className="mt-1 text-[11px] text-slate-400">เครื่องวัดคิดจากมวลไร้ไขมันจริงของคุณ จึงมักแม่นกว่าสูตร ถ้าเปิดใช้ เป้าแคลทั้งแอปจะคำนวณจากค่านี้</p>
    </Card>
  )
}

function History({ list, onEdit }: { list: Derived[]; onEdit: (s: BodyScan) => void }) {
  return (
    <Card title={`🗂️ ประวัติผลวัด (${list.length})`}>
      <ul className="divide-y divide-slate-100">
        {list.map((s) => (
          <li key={s.id}>
            <button onClick={() => onEdit(s)} className="flex w-full items-center justify-between gap-2 py-2 text-left">
              <span className="min-w-0">
                <span className="block text-sm">{formatThaiDate(s.date)}{s.device && <span className="text-xs text-slate-400"> · {s.device}</span>}</span>
                <span className="block text-xs text-slate-500">
                  {fmt1(s.weight)} กก. · ไขมัน {fmt1(s.fatPct)}%{s.visceralFat !== undefined && ` · ช่องท้อง ${s.visceralFat}`}
                </span>
              </span>
              <span className="text-xs text-emerald-700">แก้ไข ›</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

type FieldKey = Exclude<keyof BodyScan, 'id' | 'uid' | 'date' | 'device' | 'note'>
const FIELDS: { key: FieldKey; label: string; unit: string; req?: boolean; group: string }[] = [
  { key: 'weight', label: 'น้ำหนักรวม', unit: 'กก.', req: true, group: 'หลัก' },
  { key: 'fatPct', label: '% ไขมัน', unit: '%', req: true, group: 'หลัก' },
  { key: 'fatMass', label: 'มวลไขมัน', unit: 'กก.', group: 'หลัก' },
  { key: 'ffm', label: 'ร่างกายปราศจากไขมัน', unit: 'กก.', group: 'หลัก' },
  { key: 'muscleMass', label: 'มวลกล้ามเนื้อ', unit: 'กก.', group: 'หลัก' },
  { key: 'bmi', label: 'ดัชนีมวลกาย (BMI)', unit: '', group: 'หลัก' },
  { key: 'metabolicAge', label: 'อายุเมตาบอลิซึม', unit: 'ปี', group: 'หลัก' },
  { key: 'bmrKcal', label: 'BMR / อัตราการเผาผลาญ', unit: 'kcal', group: 'หลัก' },
  { key: 'visceralFat', label: 'ไขมันในช่องท้อง', unit: 'ระดับ', group: 'หลัก' },
  { key: 'tbwKg', label: 'น้ำรวมในร่างกาย (TBW)', unit: 'กก.', group: 'น้ำ' },
  { key: 'tbwPct', label: 'TBW', unit: '%', group: 'น้ำ' },
  { key: 'ecwKg', label: 'น้ำนอกเซลล์ (ECW)', unit: 'กก.', group: 'น้ำ' },
  { key: 'icwKg', label: 'น้ำในเซลล์ (ICW)', unit: 'กก.', group: 'น้ำ' },
  { key: 'ecwTbwPct', label: 'ECW/TBW', unit: '%', group: 'น้ำ' },
]

function ScanForm({ profile, scan, last, onClose }: { profile: Profile; scan?: BodyScan; last?: BodyScan; onClose: () => void }) {
  const [date, setDate] = useState(scan?.date ?? todayStr())
  const [device, setDevice] = useState(scan?.device ?? last?.device ?? '')
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, scan?.[f.key] !== undefined ? String(scan[f.key]) : ''])),
  )
  const [kj, setKj] = useState('')
  const [err, setErr] = useState('')

  const num = (k: string) => (vals[k]?.trim() ? Number(vals[k]) : undefined)
  const w = num('weight'), fp = num('fatPct')
  const hint: Partial<Record<FieldKey, string>> = w && fp ? {
    fatMass: fmt1((w * fp) / 100),
    ffm: fmt1(w - (w * fp) / 100),
    bmi: fmt1(w / (profile.heightCm / 100) ** 2),
  } : {}

  async function save() {
    if (!w || w < 30 || w > 300) return setErr('กรอกน้ำหนักให้ถูกต้อง')
    if (fp === undefined || fp < 3 || fp > 70) return setErr('กรอก % ไขมันให้ถูกต้อง')
    const data: BodyScan = { date, weight: w, fatPct: fp, ...(device.trim() ? { device: device.trim() } : {}) }
    for (const f of FIELDS) {
      const v = num(f.key)
      if (v !== undefined && !Number.isNaN(v) && f.key !== 'weight' && f.key !== 'fatPct') data[f.key] = v
    }
    if (scan?.id) await db.bodyScans.put({ ...data, id: scan.id })
    else await db.bodyScans.add(data)
    onClose()
  }

  async function remove() {
    if (scan?.id && confirm('ลบผลวัดนี้?')) {
      await db.bodyScans.delete(scan.id)
      onClose()
    }
  }

  const input = 'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-base outline-none focus:border-emerald-500'
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">{scan ? 'แก้ไขผลวัด' : 'เพิ่มผลวัดองค์ประกอบร่างกาย'}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400" aria-label="ปิด">×</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="mb-1 block text-slate-600">วันที่วัด</span>
              <input type="date" className={input} value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="block text-sm"><span className="mb-1 block text-slate-600">เครื่อง (ไม่บังคับ)</span>
              <input className={input} value={device} placeholder="เช่น MC-780" onChange={(e) => setDevice(e.target.value)} /></label>
          </div>
          {['หลัก', 'น้ำ'].map((g) => (
            <fieldset key={g}>
              <legend className="mb-2 text-sm font-semibold text-slate-700">{g === 'หลัก' ? 'ค่าหลัก' : 'น้ำในร่างกาย (ถ้ามี)'}</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {FIELDS.filter((f) => f.group === g).map((f) => (
                  <label key={f.key} className="block text-xs">
                    <span className="mb-0.5 block text-slate-600">{f.label}{f.req && <span className="text-red-500"> *</span>}{f.unit && <span className="text-slate-400"> ({f.unit})</span>}</span>
                    <input
                      type="number" inputMode="decimal" step="0.1" className={input}
                      value={vals[f.key]} placeholder={hint[f.key] ? `≈ ${hint[f.key]}` : ''}
                      onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              {g === 'หลัก' && (
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  มีแต่ค่า kJ? กรอกตรงนี้
                  <input type="number" inputMode="decimal" className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm" value={kj}
                    onChange={(e) => {
                      setKj(e.target.value)
                      const n = Number(e.target.value)
                      if (n > 0) setVals((v) => ({ ...v, bmrKcal: String(Math.round(n / 4.184)) }))
                    }} />
                  kJ → kcal อัตโนมัติ
                </label>
              )}
            </fieldset>
          ))}
          <p className="text-[11px] text-slate-400">ช่องที่เว้นว่าง แอปจะคำนวณให้เองถ้าทำได้ (ตัวเลขสีจางคือค่าประมาณ)</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex gap-2 border-t border-slate-100 p-4">
          {scan && <button onClick={remove} className="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-600">ลบ</button>}
          <button onClick={save} className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white">บันทึก</button>
        </div>
      </div>
    </div>
  )
}
