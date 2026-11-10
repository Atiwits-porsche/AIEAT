import { useState } from 'react'
import { db, MEALS, type Meal, type MealEntry } from '../lib/db'
import { fmtInt } from '../lib/calc'
import { NUT, NUT_KEYS, fmtN, perUnit, scaleN, type CustomIndex, type Nutrients } from '../lib/nutrition'
import { entryTime } from '../lib/quality'
import AddFoodSheet, { type PickedFood } from './AddFoodSheet'
import FoodEditor from './FoodEditor'

interface Draft {
  name: string
  unit: string
  kcalPerUnit: number
  n?: Nutrients
  meal: Meal
  qty: string
  time: string
  date: string
}

/** แก้รายการที่บันทึกไว้แล้วโดยไม่ต้องลบแล้วเพิ่มใหม่ — เวลาที่บันทึก (createdAt) และ id ซิงก์ยังเป็นของเดิม */
export default function EditEntrySheet({ entry: e, custom, onClose }: { entry: MealEntry; custom: CustomIndex; onClose: () => void }) {
  const [d, setD] = useState<Draft>(() => ({
    name: e.name,
    unit: e.unit,
    kcalPerUnit: e.kcalPerUnit,
    n: perUnit(e, custom),
    meal: e.meal,
    qty: String(e.qty),
    time: e.time ?? entryTime(e) ?? '',
    date: e.date,
  }))
  const [mode, setMode] = useState<'form' | 'pick' | 'values'>('form')
  const qty = Number(d.qty)
  const qtyOk = d.qty !== '' && qty > 0 && qty <= 50
  const valid = qtyOk && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
  const step = (x: number) => setD({ ...d, qty: String(Math.max(0.5, Math.round(((qtyOk ? qty : 1) + x) * 2) / 2)) })

  async function save() {
    if (!valid) return
    await db.entries.update(e.id!, {
      name: d.name,
      unit: d.unit,
      kcalPerUnit: d.kcalPerUnit,
      n: d.n,
      meal: d.meal,
      qty: Math.round(qty * 100) / 100,
      time: d.time || undefined,
      date: d.date,
    })
    onClose()
  }

  async function remove() {
    if (!confirm(`ลบ “${e.name}”?`)) return
    await db.entries.delete(e.id!)
    onClose()
  }

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${on ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`

  if (mode === 'pick') {
    return (
      <AddFoodSheet date={d.date} meal={d.meal} onClose={() => setMode('form')}
        onPick={(p: PickedFood) => setD({ ...d, name: p.name, unit: p.unit, kcalPerUnit: p.kcal, n: p.n })} />
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(ev) => ev.stopPropagation()}>
        {mode === 'values' ? (
          <FoodEditor name={d.name} unit={d.unit} kcal={d.kcalPerUnit} n={d.n}
            onCancel={() => setMode('form')}
            onSaved={(v) => { setD({ ...d, kcalPerUnit: v.kcal, n: v.n }); setMode('form') }} />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold">แก้ไขรายการ</h2>
              <button onClick={onClose} className="text-2xl leading-none text-slate-400" aria-label="ปิด">×</button>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-xs text-slate-500">{fmtInt(d.kcalPerUnit)} kcal ต่อ 1 {d.unit}</div>
                  </div>
                  {d.name !== e.name || d.unit !== e.unit ? <span className="shrink-0 rounded bg-amber-50 px-1.5 text-[11px] text-amber-700">เปลี่ยนเมนู</span> : null}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setMode('pick')} className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs text-emerald-700">🔄 เปลี่ยนเมนู</button>
                  <button onClick={() => setMode('values')} className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs text-emerald-700">✏️ แก้แคล/สารอาหาร</button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">มื้อ</div>
                <div className="flex flex-wrap gap-2">
                  {MEALS.map((m) => (
                    <button key={m.key} onClick={() => setD({ ...d, meal: m.key })} className={chip(d.meal === m.key)} aria-pressed={d.meal === m.key}>
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">จำนวน ({d.unit})</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => step(-0.5)} className="h-10 w-10 shrink-0 rounded-full border border-slate-300 text-xl" aria-label="ลดจำนวน">−</button>
                  <input type="number" inputMode="decimal" min="0" step="any" value={d.qty} aria-label="จำนวน"
                    onChange={(ev) => setD({ ...d, qty: ev.target.value })}
                    className={`w-full min-w-0 rounded-xl border px-3 py-2 text-center text-lg font-semibold outline-none ${qtyOk ? 'border-slate-300 focus:border-emerald-500' : 'border-red-400'}`} />
                  <button onClick={() => step(0.5)} className="h-10 w-10 shrink-0 rounded-full border border-slate-300 text-xl" aria-label="เพิ่มจำนวน">+</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0.25, 0.5, 1, 1.5, 2].map((x) => (
                    <button key={x} onClick={() => setD({ ...d, qty: String(x) })} className={chip(qty === x)}>{x}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">🕘 เวลาที่กิน</span>
                  <input type="time" value={d.time} onChange={(ev) => setD({ ...d, time: ev.target.value })} aria-label="เวลาที่กิน"
                    className="w-full rounded-xl border border-slate-300 px-2 py-2 text-base" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">📅 วันที่</span>
                  <input type="date" value={d.date} onChange={(ev) => setD({ ...d, date: ev.target.value })} aria-label="วันที่"
                    className="w-full rounded-xl border border-slate-300 px-2 py-2 text-base" />
                </label>
              </div>

              {qtyOk && (
                <div className="rounded-xl bg-slate-50 p-2 text-center">
                  <div className="text-xs text-slate-500">รวม</div>
                  <div className="text-lg font-bold">{fmtInt(d.kcalPerUnit * qty)} kcal</div>
                  {d.n && (
                    <div className="mt-1 grid grid-cols-4 gap-1 text-[11px] text-slate-600">
                      {NUT_KEYS.map((k) => (
                        <div key={k}>{NUT[k].icon} {fmtN(k, scaleN(d.n!, qty)[k])}{NUT[k].unit}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button onClick={save} disabled={!valid} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:bg-slate-300">
                บันทึกการแก้ไข
              </button>
              <button onClick={remove} className="w-full py-1 text-sm text-red-600">ลบรายการนี้</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
