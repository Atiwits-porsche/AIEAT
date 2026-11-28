import { useState } from 'react'
import { fmtInt } from '../lib/calc'
import { NUT, NUT_KEYS, fmtN, type Nutrients } from '../lib/nutrition'
import { MALA_DEFAULT, MALA_OIL, MALA_PARTS, MALA_PRESETS, malaCalc, malaName, rebalance, type MalaInput, type MalaOil } from '../lib/mala'

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm ${on ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`

const BAR: Record<string, string> = { meat: 'bg-rose-400', veg: 'bg-emerald-500', starch: 'bg-amber-400' }

/** เครื่องคิดหม่าล่าตัก: น้ำหนัก (ขีด/กรัม) + สัดส่วนเนื้อ/ผัก/แป้ง + น้ำมัน/ซุป/น้ำจิ้ม → แคลและสารอาหาร */
export default function MalaCalc({ initial, time, setTime, submitLabel, onBack, onSubmit }: {
  initial?: MalaInput
  time?: string
  setTime?: (t: string) => void
  submitLabel: string
  onBack: () => void
  onSubmit: (v: { name: string; kcal: number; n: Nutrients }) => void
}) {
  const [v, setV] = useState<MalaInput>(initial ?? MALA_DEFAULT)
  const [unit, setUnit] = useState<'kheed' | 'g'>('kheed')
  const [raw, setRaw] = useState(() => String((initial ?? MALA_DEFAULT).grams / 100))
  const res = malaCalc(v)
  const okWeight = v.grams >= 20 && v.grams <= 3000

  const setWeight = (s: string, u = unit) => {
    setRaw(s)
    const x = Number(s)
    setV({ ...v, grams: s === '' || !(x > 0) ? 0 : Math.round(u === 'kheed' ? x * 100 : x) })
  }
  const switchUnit = (u: 'kheed' | 'g') => {
    if (u === unit) return
    setUnit(u)
    setRaw(v.grams ? String(u === 'kheed' ? v.grams / 100 : v.grams) : '')
  }

  return (
    <div className="space-y-4 overflow-y-auto p-4">
      <button onClick={onBack} className="text-sm text-slate-500">‹ กลับ</button>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-lg font-semibold">🌶️ หม่าล่าตัก คำนวณจากน้ำหนัก</div>
          <div className="shrink-0 text-sm font-semibold text-emerald-700" aria-live="polite">≈ {fmtInt(res.kcal)} kcal</div>
        </div>
        <div className="text-xs text-slate-500">ใช้น้ำหนักบนบิลได้เลย (ร้านส่วนใหญ่ชั่งก่อนลวก) · ถ้าแบ่งกินกับคนอื่น ใส่เฉพาะส่วนที่กินเอง</div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">⚖️ น้ำหนักที่กิน</span>
          <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs" role="group" aria-label="หน่วยน้ำหนัก">
            {(['kheed', 'g'] as const).map((u) => (
              <button key={u} onClick={() => switchUnit(u)} aria-pressed={unit === u}
                className={`px-3 py-1 ${unit === u ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}>
                {u === 'kheed' ? 'ขีด' : 'กรัม'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" inputMode="decimal" min="0" step="any" value={raw} aria-label="น้ำหนักที่กิน"
            onChange={(e) => setWeight(e.target.value)}
            className={`w-full min-w-0 rounded-xl border px-3 py-2 text-center text-lg font-semibold outline-none ${okWeight ? 'border-slate-300 focus:border-emerald-500' : 'border-red-400'}`} />
          <span className="shrink-0 text-sm text-slate-500">{unit === 'kheed' ? `ขีด = ${fmtInt(v.grams)} g` : 'กรัม'}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(unit === 'kheed' ? [2, 3, 4, 5, 6, 8] : [200, 300, 400, 500, 600, 800]).map((x) => (
            <button key={x} onClick={() => setWeight(String(x))} className={chip(raw === String(x))}>{x}</button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-slate-700">สัดส่วนในชาม</div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {MALA_PARTS.map((p) => <div key={p.key} className={BAR[p.key]} style={{ width: `${v.pct[p.key]}%` }} />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {MALA_PRESETS.map((pr) => {
            const on = MALA_PARTS.every((p) => v.pct[p.key] === pr.pct[p.key])
            return <button key={pr.label} onClick={() => setV({ ...v, pct: pr.pct })} className={chip(on)} aria-pressed={on}>{pr.label}</button>
          })}
        </div>
        <div className="mt-3 space-y-2">
          {MALA_PARTS.map((p) => (
            <label key={p.key} className="block">
              <div className="flex items-center justify-between text-sm">
                <span>{p.icon} {p.label}</span>
                <span className="font-semibold tabular-nums">{v.pct[p.key]}% <span className="text-xs font-normal text-slate-500">· {res.parts[p.key]} g</span></span>
              </div>
              <input type="range" min="0" max="100" step="5" value={v.pct[p.key]} aria-label={`สัดส่วน${p.label}`}
                onChange={(e) => setV({ ...v, pct: rebalance(v.pct, p.key, Number(e.target.value)) })}
                className="w-full accent-emerald-600" />
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Row label="🛢️ น้ำมันหม่าล่า">
          {(Object.keys(MALA_OIL) as MalaOil[]).map((k) => (
            <button key={k} onClick={() => setV({ ...v, oil: k })} className={chip(v.oil === k)} aria-pressed={v.oil === k}>{MALA_OIL[k].label}</button>
          ))}
        </Row>
        <Row label="🥣 ดื่มน้ำซุป">
          {[0, 0.5, 1].map((x) => (
            <button key={x} onClick={() => setV({ ...v, soup: x })} className={chip(v.soup === x)} aria-pressed={v.soup === x}>
              {x === 0 ? 'ไม่ดื่ม' : x === 0.5 ? 'ครึ่งถ้วย' : '1 ถ้วย'}
            </button>
          ))}
        </Row>
        <Row label="🥜 น้ำจิ้มงา">
          {[0, 1, 2].map((x) => (
            <button key={x} onClick={() => setV({ ...v, sesame: x })} className={chip(v.sesame === x)} aria-pressed={v.sesame === x}>
              {x === 0 ? 'ไม่ใส่' : `${x} ถ้วย`}
            </button>
          ))}
        </Row>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-center">
        <div className="text-xs text-slate-500">รวม</div>
        <div className="text-2xl font-bold">{fmtInt(res.kcal)} kcal</div>
        <div className="mt-1 grid grid-cols-4 gap-1 text-[11px] text-slate-600">
          {NUT_KEYS.map((k) => <div key={k}>{NUT[k].icon} {fmtN(k, res.n[k])}{NUT[k].unit}</div>)}
        </div>
        {res.n.sodium > 2000 && <div className="mt-1 text-[11px] text-amber-700">โซเดียมเกิน 2,000 มก. (โควตาทั้งวัน) น้ำหนักพรุ่งนี้เช้าอาจขึ้นเป็นน้ำ</div>}
      </div>

      {setTime && (
        <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">🕘 เวลาที่กิน</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-base" aria-label="เวลาที่กิน" />
        </label>
      )}

      <button disabled={!okWeight} onClick={() => onSubmit({ name: malaName(v), kcal: res.kcal, n: res.n })}
        className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:bg-slate-300">
        {submitLabel} · {fmtInt(res.kcal)} kcal
      </button>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
