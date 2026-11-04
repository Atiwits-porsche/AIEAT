import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, MEALS, type Meal, type MealEntry, type Profile } from '../lib/db'
import { calorieTarget, fmtInt, latestWeight } from '../lib/calc'
import { addDays, formatThaiDate } from '../lib/date'
import { useFollowToday, useToday } from '../lib/useToday'
import Ring from './Ring'
import { useSync } from '../lib/sync'
import { useMeasuredBmr } from '../lib/body'
import WeightCard from './WeightCard'
import AddFoodSheet from './AddFoodSheet'
import AddActivitySheet from './AddActivitySheet'
import ActivityList from './ActivityList'

export default function Today({ profile, onOpenAccount }: { profile: Profile; onOpenAccount?: () => void }) {
  const today = useToday()
  const [date, setDate] = useFollowToday(today, (t) => t)
  const [adding, setAdding] = useState<Meal | null>(null)
  const [addingAct, setAddingAct] = useState(false)
  const acts = useLiveQuery(() => db.activities.where('date').equals(date).sortBy('createdAt'), [date]) ?? []
  const burned = acts.reduce((s, a) => s + a.kcal, 0)
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date]) ?? []
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? []
  const measured = useMeasuredBmr(profile)

  const weight = latestWeight(weights, date) ?? profile.startWeight
  const base = calorieTarget(profile, weight, measured).target
  const target = base + (profile.addExercise ? burned : 0)
  const eaten = entries.reduce((s, e) => s + e.kcalPerUnit * e.qty, 0)
  const remaining = target - eaten
  const isToday = date === today

  return (
    <div className="px-4 pt-4">
      <CloudBanner onOpen={onOpenAccount} />
      {/* ตัวเลือกวันที่ */}
      <div className="flex items-center justify-between">
        <button onClick={() => setDate(addDays(date, -1))} className="rounded-full px-3 py-1 text-2xl text-slate-500" aria-label="วันก่อนหน้า">‹</button>
        <div className="text-center">
          <div className="text-lg font-semibold">{isToday ? 'วันนี้' : formatThaiDate(date)}</div>
          {isToday ? (
            <div className="text-xs text-slate-500">{formatThaiDate(date)}</div>
          ) : (
            <button onClick={() => setDate(today)} className="text-xs text-emerald-700 underline">กลับไปวันนี้</button>
          )}
        </div>
        <button
          onClick={() => setDate(addDays(date, 1))}
          disabled={isToday}
          className="rounded-full px-3 py-1 text-2xl text-slate-500 disabled:opacity-20"
          aria-label="วันถัดไป"
        >›</button>
      </div>

      {/* สรุปแคลอรี่ */}
      <section className="mt-3 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="relative">
          <Ring value={eaten} max={target} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-2xl font-bold ${remaining < 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {fmtInt(Math.abs(remaining))}
            </div>
            <div className="text-[11px] text-slate-500">{remaining < 0 ? 'kcal เกินเป้า' : 'kcal เหลือ'}</div>
          </div>
        </div>
        <div className="flex-1 space-y-2 text-sm">
          <Stat label="เป้าหมาย" value={`${fmtInt(target)} kcal`} />
          {profile.addExercise && burned > 0 && <Stat label="รวมออกกำลังกาย" value={`+${fmtInt(burned)}`} />}
          <Stat label="กินไปแล้ว" value={`${fmtInt(eaten)} kcal`} />
          <div className="space-y-1 pt-1">
            {MEALS.map((m) => {
              const k = entries.filter((e) => e.meal === m.key).reduce((s, e) => s + e.kcalPerUnit * e.qty, 0)
              return (
                <div key={m.key} className="flex justify-between text-xs text-slate-500">
                  <span>{m.icon} {m.label}</span>
                  <span>{fmtInt(k)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <WeightCard date={date} weights={weights} profile={profile} />

      <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">🏃 ออกกำลังกาย</h2>
          <span className="text-sm text-slate-500">
            {acts.reduce((s, a) => s + a.minutes, 0)} นาที · {fmtInt(burned)} kcal
          </span>
        </div>
        <ActivityList items={acts} />
        <button
          onClick={() => setAddingAct(true)}
          className="mt-2 w-full rounded-xl border border-dashed border-orange-300 py-2 text-sm font-medium text-orange-700 active:bg-orange-50"
        >
          + บันทึกกิจกรรม
        </button>
      </section>

      {/* มื้ออาหาร */}
      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m.key)
        const total = list.reduce((s, e) => s + e.kcalPerUnit * e.qty, 0)
        return (
          <section key={m.key} className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{m.icon} {m.label}</h2>
              <span className="text-sm text-slate-500">{fmtInt(total)} kcal</span>
            </div>
            {list.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100">
                {list.map((e) => <EntryRow key={e.id} entry={e} />)}
              </ul>
            )}
            <button
              onClick={() => setAdding(m.key)}
              className="mt-2 w-full rounded-xl border border-dashed border-emerald-400 py-2 text-sm font-medium text-emerald-700 active:bg-emerald-50"
            >
              + เพิ่มอาหาร
            </button>
          </section>
        )
      })}

      {adding && <AddFoodSheet date={date} meal={adding} onClose={() => setAdding(null)} />}
      {addingAct && <AddActivitySheet date={date} profile={profile} onClose={() => setAddingAct(false)} />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

function EntryRow({ entry: e }: { entry: MealEntry }) {
  const step = async (d: number) => {
    const qty = Math.round((e.qty + d) * 2) / 2
    if (qty <= 0) return
    await db.entries.update(e.id!, { qty })
  }
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{e.name}</div>
        <div className="text-xs text-slate-500">{fmtInt(e.kcalPerUnit * e.qty)} kcal</div>
      </div>
      <div className="flex items-center rounded-lg border border-slate-200 text-sm">
        <button onClick={() => step(-0.5)} className="px-2 py-1 text-slate-500" aria-label="ลดจำนวน">−</button>
        <span className="min-w-14 text-center text-xs">{e.qty} {e.unit}</span>
        <button onClick={() => step(0.5)} className="px-2 py-1 text-slate-500" aria-label="เพิ่มจำนวน">+</button>
      </div>
      <button
        onClick={() => db.entries.delete(e.id!)}
        className="px-1 text-lg text-slate-300 hover:text-red-500"
        aria-label={`ลบ ${e.name}`}
      >×</button>
    </li>
  )
}

const BANNER_KEY = 'aieat.cloudBanner.hidden'
function CloudBanner({ onOpen }: { onOpen?: () => void }) {
  const sync = useSync()
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(BANNER_KEY) === '1' } catch { return false }
  })
  if (hidden || sync.status !== 'signed-out' || !onOpen) return null
  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
      <span className="text-xl">☁️</span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block font-semibold text-sky-900">สมัคร / เข้าสู่ระบบ เพื่อเก็บข้อมูลบนคลาวด์</span>
        <span className="block text-xs text-sky-800">ไม่หายเมื่อเปลี่ยนมือถือ ใช้ได้หลายเครื่อง ›</span>
      </button>
      <button
        onClick={() => { setHidden(true); try { localStorage.setItem(BANNER_KEY, '1') } catch { /* ignore */ } }}
        className="px-1 text-lg text-sky-400" aria-label="ซ่อน"
      >×</button>
    </div>
  )
}
