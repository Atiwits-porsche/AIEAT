import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { builtinExact } from '../lib/foods'
import { NUT, NUT_KEYS, fmtN, type Nutrients } from '../lib/nutrition'
import { countLogged, saveFood } from '../lib/foodEdit'

type Fields = Record<'kcal' | keyof Nutrients, string>

const toFields = (kcal: number, n?: Nutrients): Fields => ({
  kcal: String(kcal),
  protein: n ? String(n.protein) : '',
  fat: n ? String(n.fat) : '',
  sugar: n ? String(n.sugar) : '',
  sodium: n ? String(n.sodium) : '',
})

/** ฟอร์มแก้แคล/สารอาหารต่อ 1 หน่วยของเมนู (ชื่อ + หน่วยแก้ไม่ได้ เพราะใช้จับคู่กับรายการที่บันทึกไว้) */
export default function FoodEditor({ name, unit, kcal, n, onCancel, onSaved }: {
  name: string
  unit: string
  kcal: number
  n?: Nutrients
  onCancel: () => void
  onSaved: (v: { kcal: number; n?: Nutrients }) => void
}) {
  const base = builtinExact(name, unit)
  const [f, setF] = useState<Fields>(() => toFields(kcal, n))
  const [updatePast, setUpdatePast] = useState(true)
  const [busy, setBusy] = useState(false)
  const logged = useLiveQuery(() => countLogged(name, unit), [name, unit]) ?? 0

  const num = (v: string) => Number(v)
  const kcalOk = f.kcal !== '' && num(f.kcal) >= 0 && num(f.kcal) <= 5000
  const nutOk = NUT_KEYS.every((k) => f[k] === '' || (num(f[k]) >= 0 && num(f[k]) <= (k === 'sodium' ? 20000 : 500)))
  const anyNut = NUT_KEYS.some((k) => f[k] !== '')
  const valid = kcalOk && nutOk && (!base || anyNut)
  const isBaseNow = !!base && NUT_KEYS.every((k) => num(f[k]) === base.n[k]) && num(f.kcal) === base.kcal
  const input = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus:border-emerald-500'

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    const nn: Nutrients | undefined = anyNut
      ? { protein: num(f.protein) || 0, fat: num(f.fat) || 0, sugar: num(f.sugar) || 0, sodium: Math.round(num(f.sodium) || 0) }
      : undefined
    const k = Math.round(num(f.kcal))
    await saveFood(name, unit, k, nn, updatePast && logged > 0)
    onSaved({ kcal: k, n: nn })
  }

  return (
    <div className="space-y-3 p-4">
      <button onClick={onCancel} className="text-sm text-slate-500">‹ กลับ</button>
      <div>
        <div className="text-lg font-semibold">✏️ แก้ค่า {name}</div>
        <div className="text-sm text-slate-500">ต่อ 1 {unit}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block text-xs">
          <span className="mb-0.5 block text-slate-600">🔥 แคลอรี่ (kcal)</span>
          <input className={input} type="number" inputMode="numeric" min="0" value={f.kcal} aria-label="แคลอรี่"
            onChange={(e) => setF({ ...f, kcal: e.target.value })} />
        </label>
        {NUT_KEYS.map((k) => (
          <label key={k} className="block text-xs">
            <span className="mb-0.5 block text-slate-600">{NUT[k].icon} {NUT[k].label} ({NUT[k].unit})</span>
            <input className={input} type="number" inputMode="decimal" min="0" step="any" value={f[k]} aria-label={NUT[k].label}
              onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        ดูจากฉลากโภชนาการได้ · น้ำตาลนับเฉพาะน้ำตาลที่เติม (ไม่นับแลคโตสในนม) · ช่องที่เว้นว่างนับเป็น 0
        {!base && ' · ถ้าเว้นว่างทุกช่อง จะไม่นับเมนูนี้ในสรุปสารอาหาร'}
      </p>

      {base && (
        <div className="rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
          <div className="flex items-center justify-between gap-2">
            <span>ค่าเดิมในฐานข้อมูล</span>
            {!isBaseNow && (
              <button onClick={() => setF(toFields(base.kcal, base.n))} className="font-medium text-emerald-700 underline">คืนค่าเดิม</button>
            )}
          </div>
          <div className="mt-0.5 text-slate-500">
            {base.kcal} kcal · {NUT_KEYS.map((k) => `${NUT[k].label} ${fmtN(k, base.n[k])}${NUT[k].unit}`).join(' · ')}
          </div>
        </div>
      )}

      {logged > 0 && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={updatePast} onChange={(e) => setUpdatePast(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
          <span>ปรับรายการที่บันทึกไปแล้วด้วย ({logged} รายการ)<span className="block text-[11px] text-slate-500">ถ้าไม่ติ๊ก จะใช้ค่าใหม่เฉพาะที่เพิ่มต่อจากนี้</span></span>
        </label>
      )}

      <button onClick={submit} disabled={!valid || busy} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:bg-slate-300">
        บันทึกค่า
      </button>
    </div>
  )
}
