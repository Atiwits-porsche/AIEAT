import { useMemo } from 'react'
import { db, MEALS, type MealEntry, type Profile, type WeightLog } from '../lib/db'
import { calorieTarget, fmtInt, KCAL_PER_KG, latestWeight, type MeasuredBmr } from '../lib/calc'
import { dateRange, summarizeDays } from '../lib/stats'
import { addMonths } from '../lib/plan'
import { cheatQuota, countIn, monthEnd, monthStart, recommendedCheats, shiftMonth, useCheatsBetween } from '../lib/cheat'
import { formatThaiDate } from '../lib/date'

const monthLabel = (d: string) => {
  const [y, m] = d.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
}

export default function CheatCard({ profile, weights, entries, today, measured, bonus }: {
  profile: Profile; weights: WeightLog[]; entries: MealEntry[]; today: string; measured?: MeasuredBmr; bonus?: Map<string, number>
}) {
  const quota = cheatQuota(profile)
  const rec = recommendedCheats(profile)
  const planFrom = profile.planMonths && profile.planStartDate ? profile.planStartDate : undefined
  const histFrom = shiftMonth(today, -5)
  const from = planFrom && planFrom < histFrom ? planFrom : histFrom
  const cheats = useCheatsBetween(from, monthEnd(today))

  const data = useMemo(() => {
    if (!cheats) return null
    const cheatDates = new Set(cheats.map((c) => c.date))
    const days = summarizeDays(profile, weights, entries, dateRange(histFrom, today), measured, bonus)
    const byDate = new Map(days.map((d) => [d.date, d]))
    // แคลที่เกินเป้าในวันที่มี cheat (นับวันละครั้ง)
    const excessOf = (date: string) => {
      const d = byDate.get(date)
      return d && d.logged ? Math.max(0, d.kcal - d.target) : 0
    }
    const months = [...Array(6).keys()].map((i) => {
      const s = shiftMonth(today, i - 5)
      const e = monthEnd(s)
      const dates = [...cheatDates].filter((d) => d >= s && d <= e)
      return { start: s, used: countIn(cheats, s, e), excess: dates.reduce((sum, d) => sum + excessOf(d), 0) }
    })
    const cur = months[5]
    const f = calorieTarget(profile, latestWeight(weights, today) ?? profile.startWeight, measured)
    const deficit = Math.max(1, f.tdee - f.target)
    const thisMonth = cheats.filter((c) => c.date >= monthStart(today)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    return {
      months, cur, thisMonth, deficit,
      planUsed: planFrom ? countIn(cheats, planFrom, today) : 0,
      planExcess: planFrom ? [...cheatDates].filter((d) => d >= planFrom).reduce((s, d) => s + excessOf(d), 0) : 0,
    }
  }, [cheats, profile, weights, entries, today, measured, bonus, histFrom, planFrom])

  if (!data) return null
  const used = data.cur.used
  const left = quota - used
  const setQuota = (n: number) => db.profile.update('me', { cheatPerMonth: Math.max(0, Math.min(12, n)) })
  const delayDays = Math.round(data.cur.excess / data.deficit)

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">🍕 Cheat meal ในแผน</h2>

      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="text-xs text-slate-500">เดือนนี้ ({monthLabel(today)})</div>
          <div className="text-3xl font-bold">
            <span className={used > quota ? 'text-red-600' : 'text-orange-600'}>{used}</span>
            <span className="text-lg text-slate-400"> / {quota} มื้อ</span>
          </div>
          <div className={`text-xs ${left < 0 ? 'text-red-600' : 'text-slate-500'}`}>
            {left > 0 ? `เหลืออีก ${left} มื้อ` : left === 0 ? 'ใช้ครบแล้ว — รอเดือนหน้า' : `เกินแผน ${-left} มื้อ`}
          </div>
        </div>
        <div className="flex max-w-[55%] flex-wrap justify-end gap-1" aria-label={`ใช้ไป ${used} จาก ${quota}`}>
          {[...Array(Math.max(quota, used)).keys()].map((i) => (
            <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
              i >= quota ? 'bg-red-100 ring-1 ring-red-300' : i < used ? 'bg-orange-100 ring-1 ring-orange-300' : 'bg-slate-100'
            }`}>{i < used ? '🍕' : ''}</span>
          ))}
        </div>
      </div>

      {/* ตั้งโควตา */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
        <div>
          <div className="font-medium">ไม่เกินเดือนละ</div>
          <div className="text-[11px] text-slate-500">
            แนะนำ {rec} มื้อ สำหรับแผน {profile.ratePerWeek} กก./สัปดาห์
            {profile.cheatPerMonth !== undefined && profile.cheatPerMonth !== rec && (
              <button onClick={() => db.profile.update('me', { cheatPerMonth: undefined })} className="ml-1 text-emerald-700 underline">ใช้ค่าแนะนำ</button>
            )}
          </div>
        </div>
        <div className="flex items-center rounded-lg border border-slate-300 bg-white">
          <button onClick={() => setQuota(quota - 1)} className="px-3 py-1 text-lg text-slate-500" aria-label="ลดโควตา">−</button>
          <span className="min-w-8 text-center font-semibold">{quota}</span>
          <button onClick={() => setQuota(quota + 1)} className="px-3 py-1 text-lg text-slate-500" aria-label="เพิ่มโควตา">+</button>
        </div>
      </div>

      {/* ผลกระทบ */}
      {used > 0 && (
        <p className={`mt-2 rounded-xl px-3 py-2 text-xs ${data.cur.excess > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
          {data.cur.excess > 0
            ? `วันที่ cheat เดือนนี้กินเกินเป้ารวม ${fmtInt(data.cur.excess)} kcal ≈ ${(data.cur.excess / KCAL_PER_KG).toFixed(2)} กก. — ${delayDays >= 1 ? `ทำให้ถึงเป้าช้าลงราว ${delayDays} วัน` : 'กระทบแผนไม่ถึง 1 วัน'}`
            : 'วันที่ cheat เดือนนี้ยังไม่เกินเป้าแคลรวมของวัน 👍 (ชดเชยด้วยมื้ออื่นได้ดี)'}
        </p>
      )}

      {planFrom && profile.planMonths && (
        <div className="mt-2 text-xs text-slate-600">
          🎯 ตลอดแผน {profile.planMonths} เดือน (ถึง {formatThaiDate(addMonths(planFrom, profile.planMonths))}): ใช้ได้ {quota * profile.planMonths} มื้อ ·
          ใช้ไปแล้ว {data.planUsed} มื้อ{data.planExcess > 0 && ` · เกินเป้ารวม ${fmtInt(data.planExcess)} kcal`}
        </div>
      )}

      {data.thisMonth.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {data.thisMonth.map((c, i) => {
            const kcal = entries.filter((e) => e.date === c.date && e.meal === c.meal).reduce((s, e) => s + e.kcalPerUnit * e.qty, 0)
            const meal = MEALS.find((m) => m.key === c.meal)!
            return (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span className={i >= quota ? 'text-red-600' : ''}>{i + 1}. {formatThaiDate(c.date)} · {meal.icon} {meal.label}</span>
                <span className="text-slate-500">{fmtInt(kcal)} kcal</span>
              </li>
            )
          })}
        </ul>
      )}

      {/* ย้อนหลัง 6 เดือน */}
      <div className="mt-3 grid grid-cols-6 gap-1 text-center text-[10px]">
        {data.months.map((m) => {
          const over = m.used > quota
          return (
            <div key={m.start} className={`rounded-lg py-1.5 ${m.start === data.cur.start ? 'bg-orange-50 ring-1 ring-orange-200' : 'bg-slate-50'}`}>
              <div className="text-slate-500">{monthLabel(m.start)}</div>
              <div className={`text-sm font-semibold ${over ? 'text-red-600' : m.used ? 'text-orange-700' : 'text-slate-400'}`}>{m.used}</div>
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">จำนวน cheat meal ย้อนหลัง 6 เดือน (โควตาเดือนละ {quota})</p>

      <details className="mt-2 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">💡 cheat ยังไงไม่ให้พังแผน</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>เป็น “มื้อ” ไม่ใช่ “ทั้งวัน” — มื้อเดียวเกินไม่กี่ร้อย kcal แต่ทั้งวันอาจเกิน 1,500+</li>
          <li>วางแผนล่วงหน้า (เช่น มื้อเย็นวันเสาร์) ดีกว่ากินตามอารมณ์</li>
          <li>ยังบันทึกอาหารตามจริง แล้วกลับมาตามแผนมื้อถัดไป ไม่ต้องอดชดเชย</li>
          <li>น้ำหนักวันรุ่งขึ้นมักขึ้น 0.5–1 กก. จากเกลือและน้ำ จะลงเองใน 2–3 วัน</li>
        </ul>
      </details>
    </section>
  )
}
