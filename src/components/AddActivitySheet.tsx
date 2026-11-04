import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Profile } from '../lib/db'
import { ACTIVITY_TYPES, CAT_LABEL, estimateKcal, type ActCat, type ActType } from '../lib/exercise'
import { latestWeight } from '../lib/calc'
import { fmtInt } from '../lib/calc'

export default function AddActivitySheet({ date, profile, onClose }: { date: string; profile: Profile; onClose: () => void }) {
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? []
  const recent = useLiveQuery(() => db.activities.orderBy('createdAt').reverse().limit(50).toArray(), []) ?? []
  const [type, setType] = useState<ActType | null>(null)
  const [minutes, setMinutes] = useState('30')
  const [manual, setManual] = useState('')
  const weight = latestWeight(weights, date) ?? profile.startWeight

  const mins = Number(minutes)
  const est = type && mins > 0 ? estimateKcal(type.met, weight, mins) : 0
  const kcal = manual.trim() ? Math.round(Number(manual)) : est
  const recentTypes = [...new Set(recent.map((r) => r.type))].map((k) => ACTIVITY_TYPES.find((t) => t.key === k)).filter(Boolean).slice(0, 6) as ActType[]

  async function save() {
    if (!type || !(mins > 0 && mins <= 600) || !(kcal >= 0)) return
    await db.activities.add({ date, type: type.key, name: type.name, minutes: Math.round(mins), kcal, createdAt: Date.now() })
    onClose()
  }

  const cats = Object.keys(CAT_LABEL) as ActCat[]

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">บันทึกการออกกำลังกาย 🏃</h2>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400" aria-label="ปิด">×</button>
        </div>

        {!type ? (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {recentTypes.length > 0 && <Grid title="🕒 ล่าสุด" items={recentTypes} onPick={setType} />}
            {cats.map((c) => (
              <Grid key={c} title={CAT_LABEL[c]} items={ACTIVITY_TYPES.filter((t) => t.cat === c)} onPick={setType} />
            ))}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <button onClick={() => setType(null)} className="text-sm text-slate-500">‹ เลือกกิจกรรมอื่น</button>
            <div className="text-lg font-semibold">{type.icon} {type.name}</div>
            <div>
              <div className="mb-1 text-sm text-slate-600">ระยะเวลา (นาที)</div>
              <div className="flex flex-wrap items-center gap-2">
                {[15, 20, 30, 45, 60, 90].map((m) => (
                  <button key={m} onClick={() => setMinutes(String(m))}
                    className={`rounded-full border px-3 py-1 text-sm ${Number(minutes) === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>{m}</button>
                ))}
                <input type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-base" aria-label="นาที" />
              </div>
            </div>
            <div className="rounded-xl bg-orange-50 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-600">เผาผลาญประมาณ</span>
                <span className="text-2xl font-bold text-orange-700">{fmtInt(kcal)} kcal</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">คำนวณจากค่า MET {type.met} × น้ำหนัก {weight.toFixed(1)} กก. × {mins || 0} นาที</p>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                มีค่าจากนาฬิกา/แอปอื่น?
                <input type="number" inputMode="numeric" placeholder={String(est)} value={manual} onChange={(e) => setManual(e.target.value)}
                  className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                kcal
              </label>
            </div>
            <button onClick={save} disabled={!(mins > 0)} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:bg-slate-300">บันทึก</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Grid({ title, items, onPick }: { title: string; items: ActType[]; onPick: (t: ActType) => void }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-sm font-semibold text-slate-700">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((t) => (
          <button key={t.key} onClick={() => onPick(t)} className="flex flex-col items-center rounded-xl border border-slate-200 px-1 py-2 text-center active:bg-slate-50">
            <span className="text-2xl">{t.icon}</span>
            <span className="mt-0.5 text-[11px] leading-tight text-slate-700">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
