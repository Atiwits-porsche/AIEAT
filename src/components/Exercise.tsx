import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ActivityLog, type Profile } from '../lib/db'
import { ACTIVITY } from '../lib/calc'
import { fmtInt } from '../lib/calc'
import { addDays, formatThaiDate, todayStr } from '../lib/date'
import { weekStart } from '../lib/stats'
import { DOW, LEVELS, WEEK_PLANS, typeOf, weekDates, type Level, type PlanDay } from '../lib/exercise'
import AddActivitySheet from './AddActivitySheet'
import ActivityList from './ActivityList'

const matches = (plan: PlanDay, a: ActivityLog) => {
  const c = typeOf(a.type)?.cat
  if (plan.cat === 'cardio') return c === 'cardio' || c === 'sport'
  if (plan.cat === 'strength') return c === 'strength'
  if (plan.cat === 'flex') return c === 'flex'
  return false
}

export default function Exercise({ profile }: { profile: Profile }) {
  const today = todayStr()
  const [ws, setWs] = useState(weekStart(today))
  const [adding, setAdding] = useState(false)
  const level: Level = profile.exerciseLevel ?? 'beginner'
  const plan = WEEK_PLANS[level]
  const dates = weekDates(ws)
  const week = useLiveQuery(() => db.activities.where('date').between(dates[0], dates[6], true, true).toArray(), [ws]) ?? []
  const history = useLiveQuery(() => db.activities.where('date').between(addDays(today, -29), today, true, true).reverse().sortBy('date'), [today]) ?? []

  const aerobicMin = week.filter((a) => ['cardio', 'sport'].includes(typeOf(a.type)?.cat ?? '')).reduce((s, a) => s + a.minutes, 0)
  const totalMin = week.reduce((s, a) => s + a.minutes, 0)
  const kcal = week.reduce((s, a) => s + a.kcal, 0)
  const strengthDays = new Set(week.filter((a) => typeOf(a.type)?.cat === 'strength').map((a) => a.date)).size
  const aerobicTarget = Math.max(150, plan.filter((p) => p.cat === 'cardio').reduce((s, p) => s + p.minutes, 0))
  const strengthTarget = plan.filter((p) => p.cat === 'strength').length
  const activeDays = new Set(week.map((a) => a.date)).size
  const isThisWeek = ws === weekStart(today)

  const byDate = new Map<string, ActivityLog[]>()
  for (const a of history) byDate.set(a.date, [...(byDate.get(a.date) ?? []), a])

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">ออกกำลังกาย</h1>
        <button onClick={() => setAdding(true)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">+ บันทึกกิจกรรม</button>
      </div>

      {/* สรุปสัปดาห์ */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setWs(addDays(ws, -7))} className="px-2 text-xl text-slate-500" aria-label="สัปดาห์ก่อน">‹</button>
          <div className="text-center">
            <div className="font-semibold">{isThisWeek ? 'สัปดาห์นี้' : 'สัปดาห์'}</div>
            <div className="text-xs text-slate-500">{formatThaiDate(dates[0])} – {formatThaiDate(dates[6])}</div>
          </div>
          <button onClick={() => setWs(addDays(ws, 7))} disabled={isThisWeek} className="px-2 text-xl text-slate-500 disabled:opacity-20" aria-label="สัปดาห์ถัดไป">›</button>
        </div>
        <Progress label="คาร์ดิโอ + กีฬา" value={aerobicMin} target={aerobicTarget} unit="นาที" />
        <Progress label="เวท / สร้างกล้ามเนื้อ" value={strengthDays} target={strengthTarget} unit="วัน" />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Mini label="รวมทั้งหมด" value={`${totalMin}`} unit="นาที" />
          <Mini label="เผาผลาญ" value={fmtInt(kcal)} unit="kcal" />
          <Mini label="วันที่ขยับ" value={`${activeDays}/7`} unit="วัน" />
        </div>
      </section>

      {/* แผนรายสัปดาห์ */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">🗓️ แผนออกกำลังกายรายสัปดาห์</h2>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {LEVELS.map((l) => (
            <button key={l.key} onClick={() => db.profile.update('me', { exerciseLevel: l.key })}
              className={`rounded-lg py-1.5 ${level === l.key ? 'bg-white font-semibold text-emerald-700 shadow-sm' : 'text-slate-600'}`}>{l.label}</button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{LEVELS.find((l) => l.key === level)!.desc}</p>
        <ul className="mt-2 divide-y divide-slate-100">
          {plan.map((p, i) => {
            const d = dates[i]
            const logged = week.filter((a) => a.date === d)
            const done = p.cat === 'rest' ? logged.length > 0 : logged.some((a) => matches(p, a))
            const past = d < today
            const isToday = d === today
            return (
              <li key={i} className={`flex items-center gap-3 py-2 ${isToday ? '-mx-2 rounded-xl bg-emerald-50 px-2' : ''}`}>
                <div className="w-14 text-xs">
                  <div className={`font-semibold ${isToday ? 'text-emerald-700' : 'text-slate-700'}`}>{DOW[i]}</div>
                  <div className="text-slate-400">{formatThaiDate(d).replace(/^\S+\s/, '').replace(/\s\d+$/, '')}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{p.cat === 'rest' ? '😴 ' : ''}{p.label}</div>
                  <div className="text-xs text-slate-500">
                    {p.minutes ? `${p.minutes} นาที` : 'วันพัก'}
                    {logged.length > 0 && ` · ทำแล้ว ${logged.reduce((s, a) => s + a.minutes, 0)} นาที`}
                  </div>
                </div>
                <span className={`text-lg ${done ? 'text-emerald-600' : past && p.cat !== 'rest' ? 'text-slate-300' : 'text-slate-200'}`} aria-label={done ? 'ทำแล้ว' : 'ยังไม่ทำ'}>
                  {done ? '✅' : past && p.cat !== 'rest' ? '✕' : '○'}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-[11px] text-slate-400">
          อ้างอิงคำแนะนำ WHO: คาร์ดิโอระดับปานกลาง 150–300 นาที/สัปดาห์ + เวทอย่างน้อย 2 วัน/สัปดาห์ — สลับวันได้ตามสะดวก ขอให้ครบในสัปดาห์
        </p>
      </section>

      {/* นับแคลเพิ่ม */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">นับแคลที่เผาผลาญ เพิ่มในงบแคลของวันนั้น</span>
          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={!!profile.addExercise}
            onChange={(e) => db.profile.update('me', { addExercise: e.target.checked })} />
        </label>
        <p className="mt-1 text-xs text-slate-500">
          ระดับกิจกรรมในโปรไฟล์ตอนนี้: <b>{ACTIVITY[profile.activity].label}</b> —
          {profile.activity === 'sedentary'
            ? ' แนะนำให้เปิด เพราะเป้าแคลยังไม่ได้รวมการออกกำลังกาย'
            : ' แนะนำให้ปิด เพราะ TDEE รวมการออกกำลังกายไว้แล้ว (เปิดแล้วจะนับซ้ำ)'}
        </p>
      </section>

      {/* ประวัติ */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">🗂️ ประวัติ 30 วันล่าสุด</h2>
        {byDate.size === 0 ? (
          <p className="mt-1 text-sm text-slate-500">ยังไม่มีบันทึก กด “+ บันทึกกิจกรรม” เพื่อเริ่ม</p>
        ) : (
          [...byDate.entries()].map(([d, items]) => (
            <div key={d} className="mt-2">
              <div className="flex justify-between text-xs font-semibold text-slate-500">
                <span>{formatThaiDate(d)}</span>
                <span>{items.reduce((s, a) => s + a.minutes, 0)} นาที · {fmtInt(items.reduce((s, a) => s + a.kcal, 0))} kcal</span>
              </div>
              <ActivityList items={items} />
            </div>
          ))
        )}
      </section>

      {adding && <AddActivitySheet date={today} profile={profile} onClose={() => setAdding(false)} />}
    </div>
  )
}

function Progress({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = Math.min(1, target ? value / target : 0)
  return (
    <div className="mt-2">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span><b>{value}</b> / {target} {unit} {value >= target && '✅'}</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-slate-100">
        <div className="h-2.5 rounded-full" style={{ width: `${pct * 100}%`, background: value >= target ? '#10b981' : '#2a78d6' }} />
      </div>
    </div>
  )
}

function Mini({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      <div className="text-[10px] text-slate-500">{unit}</div>
    </div>
  )
}
