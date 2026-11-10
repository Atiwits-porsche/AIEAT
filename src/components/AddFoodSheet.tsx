import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, MEALS, type Meal } from '../lib/db'
import { CATEGORIES, FOODS } from '../lib/foods'
import { fmtInt } from '../lib/calc'
import { NUT, NUT_KEYS, customIndex, fmtN, perUnit, scaleN, type Nutrients } from '../lib/nutrition'
import { EntryNutrients } from './Nutrition'

interface Pick { name: string; kcal: number; unit: string; tag?: string; n?: Nutrients; k?: string }

const keyOf = (p: Pick) => `${p.name}|${p.unit}|${p.kcal}`
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

export default function AddFoodSheet({ date, meal, onClose }: { date: string; meal: Meal; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Pick | null>(null)
  const [qty, setQty] = useState(1)
  const [creating, setCreating] = useState(false)

  const custom = useLiveQuery(() => db.customFoods.toArray(), []) ?? []
  const recentEntries = useLiveQuery(() => db.entries.orderBy('createdAt').reverse().limit(300).toArray(), []) ?? []

  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: Pick[] = []
    const ci = customIndex(custom)
    for (const e of recentEntries) {
      const p = { name: e.name, kcal: e.kcalPerUnit, unit: e.unit, n: perUnit(e, ci) }
      const k = keyOf(p)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(p)
      if (out.length >= 12) break
    }
    return out
  }, [recentEntries, custom])

  const all: Pick[] = useMemo(
    () => [
      ...custom.map((c) => ({ name: c.name, kcal: c.kcal, unit: c.unit, tag: 'เมนูของฉัน', n: c.n })),
      ...FOODS.map((f) => ({ name: f.name, kcal: f.kcal, unit: f.unit, tag: f.cat, n: f.n, k: f.k })),
    ],
    [custom],
  )

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean).map(norm)
    if (!words.length) return []
    const seen = new Set<string>()
    // ทุกคำต้องเจอในชื่อ หรือคำค้นของแบรนด์ เช่น "เซเว่น โปรตีน", "bonchon", "coco หมูทอด"
    return [...recent, ...all].filter((p) => {
      const k = keyOf(p)
      const hay = norm(`${p.name} ${p.k ?? ''}`)
      if (seen.has(k) || !words.every((w) => hay.includes(w))) return false
      seen.add(k)
      return true
    })
  }, [q, recent, all])

  async function add() {
    if (!picked || qty <= 0) return
    await db.entries.add({
      date,
      meal,
      name: picked.name,
      unit: picked.unit,
      kcalPerUnit: picked.kcal,
      ...(picked.n ? { n: picked.n } : {}),
      qty,
      createdAt: Date.now(),
    })
    onClose()
  }

  const mealLabel = MEALS.find((m) => m.key === meal)!

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">เพิ่มใน{mealLabel.label} {mealLabel.icon}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400" aria-label="ปิด">×</button>
        </div>

        {picked ? (
          <QtyPanel picked={picked} qty={qty} setQty={setQty} onBack={() => setPicked(null)} onAdd={add} />
        ) : creating ? (
          <CreateFood
            initialName={q}
            onCancel={() => setCreating(false)}
            onCreated={(p) => { setCreating(false); setPicked(p); setQty(1) }}
          />
        ) : (
          <>
            <div className="px-4 pt-3">
              <input
                autoFocus
                placeholder="ค้นหา เช่น กะเพรา, ชาเย็น, เซเว่น โปรตีน, bonchon"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-base outline-none focus:border-emerald-500"
              />
              <button onClick={() => setCreating(true)} className="mt-2 text-sm font-medium text-emerald-700">
                + ไม่เจอเมนู? เพิ่มเมนูเอง / ใส่แคลเอง
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {q ? (
                results.length ? (
                  <List items={results} onPick={(p) => { setPicked(p); setQty(1) }} />
                ) : (
                  <p className="py-6 text-center text-sm text-slate-500">ไม่พบ “{q}” ลองเพิ่มเป็นเมนูของคุณเอง</p>
                )
              ) : (
                <>
                  {recent.length > 0 && <Group title="🕒 กินบ่อย/ล่าสุด" items={recent} onPick={(p) => { setPicked(p); setQty(1) }} />}
                  {custom.length > 0 && (
                    <Group title="⭐ เมนูของฉัน" items={all.filter((p) => p.tag === 'เมนูของฉัน')} onPick={(p) => { setPicked(p); setQty(1) }} />
                  )}
                  {CATEGORIES.map((c) => (
                    <Group key={c} title={c} collapsed items={all.filter((p) => p.tag === c)} onPick={(p) => { setPicked(p); setQty(1) }} />
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Group({ title, items, onPick, collapsed }: { title: string; items: Pick[]; onPick: (p: Pick) => void; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed)
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between py-1 text-sm font-semibold text-slate-700">
        {title}
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && <List items={items} onPick={onPick} />}
    </div>
  )
}

function List({ items, onPick }: { items: Pick[]; onPick: (p: Pick) => void }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((p) => (
        <li key={keyOf(p)}>
          <button onClick={() => onPick(p)} className="flex w-full items-center justify-between py-2.5 text-left active:bg-slate-50">
            <span className="min-w-0 text-sm">
              {p.name} <span className="text-xs text-slate-400">/ {p.unit}</span>
              {p.n && <span className="block leading-tight"><EntryNutrients n={p.n} lead={false} /></span>}
            </span>
            <span className="shrink-0 pl-2 text-sm text-slate-600">{fmtInt(p.kcal)} kcal</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function QtyPanel({ picked, qty, setQty, onBack, onAdd }: {
  picked: Pick; qty: number; setQty: (n: number) => void; onBack: () => void; onAdd: () => void
}) {
  const step = (d: number) => setQty(Math.max(0.5, Math.round((qty + d) * 2) / 2))
  return (
    <div className="p-4">
      <button onClick={onBack} className="text-sm text-slate-500">‹ กลับ</button>
      <div className="mt-2 text-lg font-semibold">{picked.name}</div>
      <div className="text-sm text-slate-500">{fmtInt(picked.kcal)} kcal ต่อ 1 {picked.unit}</div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button onClick={() => step(-0.5)} className="h-12 w-12 rounded-full border border-slate-300 text-2xl">−</button>
        <div className="min-w-24 text-center">
          <div className="text-3xl font-bold">{qty}</div>
          <div className="text-sm text-slate-500">{picked.unit}</div>
        </div>
        <button onClick={() => step(0.5)} className="h-12 w-12 rounded-full border border-slate-300 text-2xl">+</button>
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {[0.5, 1, 1.5, 2].map((n) => (
          <button
            key={n}
            onClick={() => setQty(n)}
            className={`rounded-full border px-3 py-1 text-sm ${qty === n ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}
          >{n}</button>
        ))}
      </div>

      {picked.n ? (
        <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-50 p-2 text-center">
          {NUT_KEYS.map((k) => (
            <div key={k}>
              <div className="text-[10px] text-slate-500">{NUT[k].icon} {NUT[k].label}</div>
              <div className="text-sm font-semibold">{fmtN(k, scaleN(picked.n!, qty)[k])}</div>
              <div className="text-[10px] text-slate-400">{NUT[k].unit}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-center text-xs text-slate-400">เมนูนี้ไม่มีข้อมูลสารอาหาร</p>
      )}

      <button onClick={onAdd} className="mt-5 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white">
        เพิ่ม · {fmtInt(picked.kcal * qty)} kcal
      </button>
    </div>
  )
}

function CreateFood({ initialName, onCancel, onCreated }: {
  initialName: string; onCancel: () => void; onCreated: (p: Pick) => void
}) {
  const [name, setName] = useState(initialName)
  const [kcal, setKcal] = useState('')
  const [unit, setUnit] = useState('จาน')
  const [save, setSave] = useState(true)
  const [nut, setNut] = useState<Record<keyof Nutrients, string>>({ protein: '', fat: '', sugar: '', sodium: '' })
  const n = Number(kcal)
  const anyNut = NUT_KEYS.some((k) => nut[k] !== '')
  const nutValid = NUT_KEYS.every((k) => nut[k] === '' || (Number(nut[k]) >= 0 && Number(nut[k]) <= (k === 'sodium' ? 20000 : 500)))
  const valid = name.trim() && kcal !== '' && n >= 0 && n <= 5000 && unit.trim() && nutValid
  const input = 'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-emerald-500'

  async function submit() {
    if (!valid) return
    const nn: Nutrients | undefined = anyNut
      ? { protein: Number(nut.protein) || 0, fat: Number(nut.fat) || 0, sugar: Number(nut.sugar) || 0, sodium: Math.round(Number(nut.sodium) || 0) }
      : undefined
    const p = { name: name.trim(), kcal: Math.round(n), unit: unit.trim(), ...(nn ? { n: nn } : {}) }
    if (save) await db.customFoods.add(p)
    onCreated(p)
  }

  return (
    <div className="space-y-3 p-4">
      <button onClick={onCancel} className="text-sm text-slate-500">‹ กลับ</button>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">ชื่ออาหาร</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ข้าวกล่องคลีนร้านป้า" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">แคลอรี่ (kcal)</span>
          <input className={input} type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">ต่อ 1 …</span>
          <input className={input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="จาน / ชิ้น / แก้ว" />
        </label>
      </div>
      <details className="rounded-xl border border-slate-200 px-3 py-2 text-sm" open={anyNut}>
        <summary className="cursor-pointer font-medium text-slate-700">สารอาหารต่อ 1 {unit || 'หน่วย'} (ไม่บังคับ)</summary>
        <p className="mt-1 text-xs text-slate-500">ดูจากฉลากโภชนาการ · ช่องที่เว้นว่างนับเป็น 0 · ถ้าไม่กรอกเลย จะไม่นับในสรุปสารอาหาร</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {NUT_KEYS.map((k) => (
            <label key={k} className="block text-xs">
              <span className="mb-0.5 block text-slate-600">{NUT[k].icon} {NUT[k].label} ({NUT[k].unit})</span>
              <input className={input} type="number" inputMode="decimal" min="0" value={nut[k]}
                onChange={(e) => setNut({ ...nut, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      </details>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
        บันทึกเป็น “เมนูของฉัน” ไว้ใช้ครั้งหน้า
      </label>
      <button onClick={submit} disabled={!valid} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:bg-slate-300">
        ต่อไป
      </button>
    </div>
  )
}
