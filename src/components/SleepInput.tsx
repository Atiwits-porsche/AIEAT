import { useRef, useState } from 'react'
import type { WeightLog } from '../lib/db'
import { SLEEP_MIN_H, fmtHours, fromMin, sleepHours, toMin } from '../lib/quality'

type Field = 'sleepAt' | 'wakeAt'

const PRESETS: Record<Field, string[]> = {
  sleepAt: ['21:30', '22:00', '22:30', '23:00', '23:30', '00:00', '00:30', '01:00', '01:30', '02:00'],
  wakeAt: ['05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '10:00'],
}
const LABEL: Record<Field, string> = { sleepAt: 'เข้านอน', wakeAt: 'ตื่น' }

const shift = (t: string, d: number) => fromMin((toMin(t) + d + 1440) % 1440)

/** บันทึกเวลาเข้านอน/ตื่น: แตะเลือกเวลาที่ใช้บ่อย, ปรับ ±15 นาที, หรือใช้เวลาเดิมจากคืนก่อน */
export default function SleepInput({ log, prev, onSet }: {
  log?: WeightLog
  /** บันทึกการนอนล่าสุดก่อนวันนี้ที่มีครบทั้งสองเวลา */
  prev?: WeightLog
  onSet: (v: Partial<Record<Field, string | undefined>>) => void
}) {
  const [open, setOpen] = useState<Field | null>(null)
  const custom = useRef<HTMLInputElement>(null)
  const slept = sleepHours(log?.sleepAt, log?.wakeAt)
  const empty = !log?.sleepAt && !log?.wakeAt
  const cur = open ? log?.[open] : undefined
  // ยังไม่มีค่า: กด ±15 ครั้งแรกจะตั้งเป็นเวลาคืนก่อน (หรือค่ากลางของปุ่มลัด) ก่อน
  const nudge = (f: Field, d: number) => set(f, cur ? shift(cur, d) : prev?.[f] ?? PRESETS[f][4])

  const set = (f: Field, v: string | undefined) => onSet({ [f]: v })
  const pick = (f: Field, v: string) => {
    set(f, v)
    // เลือกเวลาเข้านอนแล้วไปต่อที่เวลาตื่นเลย ถ้ายังไม่ได้ใส่
    setOpen(f === 'sleepAt' && !log?.wakeAt ? 'wakeAt' : null)
  }

  const chip = (on: boolean) =>
    `rounded-lg border py-1.5 text-sm ${on ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700' : 'border-slate-200 text-slate-700 active:bg-slate-100'}`

  return (
    <div className="mt-2 rounded-xl border border-slate-200 px-3 py-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-500">😴 การนอนเมื่อคืน</span>
        {slept !== undefined ? (
          <span className={`font-semibold ${slept < SLEEP_MIN_H ? 'text-amber-700' : 'text-slate-800'}`}>{fmtHours(slept)}</span>
        ) : (
          <span className="text-[11px] text-slate-400">แตะเพื่อใส่เวลา</span>
        )}
      </div>

      <div className="mt-1 grid grid-cols-2 gap-2">
        {(['sleepAt', 'wakeAt'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setOpen(open === f ? null : f)} aria-expanded={open === f}
            aria-label={`เวลา${LABEL[f]}`}
            className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs ${open === f ? 'bg-emerald-50 ring-2 ring-emerald-200' : 'bg-slate-50'}`}>
            <span className="text-slate-500">{LABEL[f]}</span>
            {log?.[f] ? <span className="text-base font-semibold text-slate-800">{log[f]}</span> : <span className="text-sm text-emerald-700">+ ใส่</span>}
          </button>
        ))}
      </div>

      {empty && !open && prev?.sleepAt && prev?.wakeAt && (
        <button type="button" onClick={() => onSet({ sleepAt: prev.sleepAt, wakeAt: prev.wakeAt })}
          className="mt-2 w-full rounded-lg border border-dashed border-emerald-300 py-1.5 text-xs text-emerald-700">
          ↺ ใช้เวลาเดิม {prev.sleepAt} → {prev.wakeAt}
        </button>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-5 gap-1.5">
            {PRESETS[open].map((t) => (
              <button key={t} type="button" onClick={() => pick(open, t)} className={chip(cur === t)}>{t}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => nudge(open, -15)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600" aria-label="ลด 15 นาที">−15 นาที</button>
            <input ref={custom} type="time" value={cur ?? ''} onChange={(e) => set(open, e.target.value || undefined)} aria-label={`ระบุเวลา${LABEL[open]}เอง`}
              onClick={() => { try { custom.current?.showPicker?.() } catch { /* เบราว์เซอร์ไม่รองรับ */ } }}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-center text-base" />
            <button type="button" onClick={() => nudge(open, 15)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600" aria-label="เพิ่ม 15 นาที">+15 นาที</button>
          </div>
          <div className="flex justify-between text-xs">
            {cur ? <button type="button" onClick={() => set(open, undefined)} className="text-slate-400 underline">ลบเวลา{LABEL[open]}</button> : <span />}
            <button type="button" onClick={() => setOpen(null)} className="font-medium text-emerald-700">เสร็จ</button>
          </div>
        </div>
      )}
    </div>
  )
}
