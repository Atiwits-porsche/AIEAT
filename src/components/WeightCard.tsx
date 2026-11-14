import { useState } from 'react'
import { db, type Profile, type WeightLog } from '../lib/db'
import { avg7, bmi, bmiLabel, fmt1, latestWeight } from '../lib/calc'
import { addDays } from '../lib/date'
import { SLEEP_MIN_H, fmtHours, sleepHours, waistLogs, whtr } from '../lib/quality'

type Slot = 'morningKg' | 'eveningKg' | 'waistCm'

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
  const lastWaist = waistLogs(weights.filter((w) => w.date <= date)).pop()

  function open(slot: Slot) {
    setEditing(slot)
    setValue(log?.[slot] ? String(log[slot]) : '')
  }

  async function save() {
    if (!editing) return
    const n = Number(value)
    const next: WeightLog = { ...(log ?? { date }), date }
    if (value.trim() === '') delete next[editing]
    else if (editing === 'waistCm' ? n >= 40 && n <= 200 : n >= 30 && n <= 300) next[editing] = Math.round(n * 10) / 10
    else return
    await putLog(next)
    setEditing(null)
  }

  async function putLog(next: WeightLog) {
    if (next.morningKg || next.eveningKg || next.waistCm || next.sleepAt || next.wakeAt) await db.weights.put(next)
    else await db.weights.delete(date)
  }

  async function setSleep(field: 'sleepAt' | 'wakeAt', v: string) {
    const next: WeightLog = { ...(log ?? { date }), date }
    if (v) next[field] = v
    else delete next[field]
    await putLog(next)
  }

  const slept = sleepHours(log?.sleepAt, log?.wakeAt)

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

      <button
        onClick={() => open('waistCm')}
        className={`mt-2 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${editing === 'waistCm' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}
      >
        <span className="text-xs text-slate-500">📏 รอบเอว <span className="text-slate-400">(ระดับสะดือ สัปดาห์ละครั้ง)</span></span>
        {log?.waistCm ? (
          <span className="font-semibold">{fmt1(log.waistCm)} ซม.</span>
        ) : lastWaist ? (
          <span className="text-xs text-slate-500">ล่าสุด {fmt1(lastWaist.waistCm)} ซม. · <span className="text-emerald-700">+ วัดวันนี้</span></span>
        ) : (
          <span className="text-emerald-700">+ บันทึก</span>
        )}
      </button>

      <div className="mt-2 rounded-xl border border-slate-200 px-3 py-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-500">😴 การนอนเมื่อคืน</span>
          {slept !== undefined ? (
            <span className={`font-semibold ${slept < SLEEP_MIN_H ? 'text-amber-700' : 'text-slate-800'}`}>{fmtHours(slept)}</span>
          ) : (
            <span className="text-[11px] text-slate-400">ใส่เวลาเข้านอนและตื่น</span>
          )}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
          <label className="flex min-w-0 items-center gap-1 rounded-lg bg-slate-50 px-2 py-1">
            <span className="shrink-0 text-slate-500">เข้านอน</span>
            <input type="time" value={log?.sleepAt ?? ''} onChange={(e) => setSleep('sleepAt', e.target.value)} aria-label="เวลาเข้านอน"
              className="min-w-0 flex-1 bg-transparent text-right text-sm [&::-webkit-calendar-picker-indicator]:hidden" />
          </label>
          <label className="flex min-w-0 items-center gap-1 rounded-lg bg-slate-50 px-2 py-1">
            <span className="shrink-0 text-slate-500">ตื่น</span>
            <input type="time" value={log?.wakeAt ?? ''} onChange={(e) => setSleep('wakeAt', e.target.value)} aria-label="เวลาตื่น"
              className="min-w-0 flex-1 bg-transparent text-right text-sm [&::-webkit-calendar-picker-indicator]:hidden" />
          </label>
        </div>
      </div>

      {editing && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder={editing === 'waistCm' ? 'รอบเอว ซม. เช่น 86' : 'เช่น 68.4'}
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
        {lastWaist && (
          <Row label="รอบเอว/ส่วนสูง" value={`${whtr(lastWaist.waistCm, profile.heightCm).toFixed(2)} (เป้า < 0.5)`} />
        )}
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
