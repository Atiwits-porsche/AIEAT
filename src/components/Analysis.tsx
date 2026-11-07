import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Profile } from '../lib/db'
import { calorieTarget, fmt1, fmtInt, latestWeight } from '../lib/calc'
import { addDays, formatThaiDate } from '../lib/date'
import {
  dateRange, estimateRealTDEE, insights, mealShare, streak, summarizeDays, topFoods, weeklyRows,
} from '../lib/stats'
import { C, CalorieChart, WeightChart } from './Charts'
import { useMeasuredBmr } from '../lib/body'
import PlanCard from './PlanCard'
import { useToday } from '../lib/useToday'
import { useExerciseBonus } from '../lib/exercise'
import { NutritionAnalysis } from './Nutrition'
import { dailyLimits } from '../lib/nutrition'

const RANGES = [
  { key: 7, label: '7 วัน' },
  { key: 30, label: '30 วัน' },
  { key: 90, label: '90 วัน' },
  { key: 0, label: 'ทั้งหมด' },
] as const

export default function Analysis({ profile }: { profile: Profile }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>(30)
  const weights = useLiveQuery(() => db.weights.toArray(), [])
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const today = useToday()
  const measured = useMeasuredBmr(profile)
  const bonus = useExerciseBonus(profile)

  const data = useMemo(() => {
    if (!weights || !entries) return null
    let from: string
    if (range) from = addDays(today, -(range - 1))
    else {
      const all = [profile.createdAt, ...weights.map((w) => w.date), ...entries.map((e) => e.date)].sort()
      from = all[0] < today ? all[0] : addDays(today, -6)
    }
    const days = summarizeDays(profile, weights, entries, dateRange(from, today), measured, bonus)
    const inRange = entries.filter((e) => e.date >= from && e.date <= today)
    const complete = days.filter((d) => d.logged && d.date !== today)
    const completeSet = new Set(complete.map((d) => d.date))
    const avgKcal = complete.length ? complete.reduce((s, d) => s + d.kcal, 0) / complete.length : undefined
    const onTarget = complete.filter((d) => d.kcal <= d.target).length
    const avgs = days.filter((d) => d.avg7 !== undefined)
    const wChange = avgs.length >= 2 ? avgs[avgs.length - 1].avg7! - avgs[0].avg7! : undefined
    const curWeight = latestWeight(weights, today) ?? profile.startWeight
    const formula = calorieTarget(profile, curWeight, measured)
    return {
      from,
      limits: dailyLimits(profile, curWeight, formula.target),
      days,
      avgKcal,
      complete: complete.length,
      onTarget,
      wChange,
      share: mealShare(inRange.filter((e) => completeSet.has(e.date))),
      top: topFoods(inRange),
      notes: insights(days, inRange, today),
      weeks: weeklyRows(days, today),
      streak: streak(weights, entries, today),
      real: estimateRealTDEE(weights, entries, today),
      formula,
    }
  }, [weights, entries, range, profile, today, measured?.kcal, measured?.weight, bonus])

  if (!data) return null

  return (
    <div className="space-y-3 px-4 pt-4">
      <h1 className="text-lg font-semibold">สถิติและการวิเคราะห์</h1>

      {/* ตัวกรองช่วงเวลา */}
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 p-1 text-sm">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-lg py-1.5 ${range === r.key ? 'bg-white font-semibold text-emerald-700 shadow-sm' : 'text-slate-600'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="แคลเฉลี่ย/วัน" value={data.avgKcal !== undefined ? fmtInt(data.avgKcal) : '–'} unit="kcal"
          sub={data.avgKcal !== undefined ? `เป้า ${fmtInt(data.formula.target)}` : 'ยังไม่มีวันที่บันทึกครบ'} />
        <Tile label="วันที่อยู่ในเป้า" value={data.complete ? `${data.onTarget}/${data.complete}` : '–'} unit="วัน"
          sub={data.complete ? `${Math.round((data.onTarget / data.complete) * 100)}% ของวันที่บันทึก` : 'ไม่นับวันนี้'} />
        <Tile label="น้ำหนักเปลี่ยน" value={data.wChange !== undefined ? `${data.wChange > 0 ? '+' : ''}${fmt1(data.wChange)}` : '–'} unit="กก."
          sub="จากค่าเฉลี่ย 7 วัน" tone={data.wChange === undefined ? undefined : data.wChange <= 0 ? 'good' : 'warn'} />
        <Tile label="บันทึกต่อเนื่อง" value={String(data.streak)} unit="วัน" sub={data.streak >= 7 ? 'เยี่ยมมาก 🔥' : 'บันทึกทุกวันจะวิเคราะห์ได้แม่นขึ้น'} />
      </div>

      <PlanCard profile={profile} weights={weights ?? []} today={today} measured={measured} />

      {/* TDEE จริง */}
      <Card title="🔥 พลังงานที่ใช้จริง (TDEE)">
        {data.real ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold">{fmtInt(data.real.tdee)} kcal</span>
              <span className="text-sm text-slate-500">{data.formula.bmrSource === 'measured' ? 'จาก BMR เครื่องวัด' : 'สูตรคำนวณ'} {fmtInt(data.formula.tdee)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              ประเมินจากแคลที่กินเฉลี่ย {fmtInt(data.real.avgKcal)} kcal ({data.real.loggedDays} วัน) และแนวโน้มน้ำหนัก 28 วัน
              {Math.abs(data.real.tdee - data.formula.tdee) > 200 &&
                ` — ต่างจากสูตร ${fmtInt(Math.abs(data.real.tdee - data.formula.tdee))} kcal ถ้าเป็นแบบนี้ต่อเนื่อง ควรปรับระดับกิจกรรมในหน้าตั้งค่า`}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">บันทึกอาหารให้ครบอย่างน้อย 14 วัน (ใน 28 วัน) พร้อมชั่งน้ำหนักเช้า แล้วจะคำนวณ TDEE จริงของคุณให้</p>
        )}
      </Card>

      <Card title="⚖️ น้ำหนัก">
        <WeightChart days={data.days} goal={profile.goalWeight} />
      </Card>

      <Card title="🍽️ แคลอรี่รายวัน">
        <CalorieChart days={data.days} />
      </Card>

      <NutritionAnalysis entries={entries ?? []} limits={data.limits} from={data.from} today={today} />

      {data.notes.length > 0 && (
        <Card title="💡 ข้อสังเกต">
          <ul className="space-y-2">
            {data.notes.map((n, i) => (
              <li key={i} className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${
                n.tone === 'good' ? 'bg-emerald-50 text-emerald-900' : n.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'
              }`}>
                <span>{n.icon}</span>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.share.some((s) => s.kcal > 0) && (
        <Card title="🥧 สัดส่วนแคลตามมื้อ">
          <ul className="space-y-2">
            {data.share.map((s) => (
              <li key={s.key} className="text-sm">
                <div className="flex justify-between">
                  <span>{s.icon} {s.label}</span>
                  <span className="text-slate-600">{Math.round(s.share * 100)}% · {fmtInt(s.kcal / Math.max(1, data.complete))} kcal/วัน</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full" style={{ width: `${s.share * 100}%`, background: C.s1 }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.top.length > 0 && (
        <Card title="🏆 เมนูที่ให้แคลรวมมากที่สุด">
          <ol className="divide-y divide-slate-100 text-sm">
            {data.top.map((f, i) => (
              <li key={f.name} className="flex justify-between py-1.5">
                <span>{i + 1}. {f.name} <span className="text-xs text-slate-400">× {f.times}</span></span>
                <span className="text-slate-600">{fmtInt(f.kcal)} kcal</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card title="📆 สรุปรายสัปดาห์">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-1 py-1 text-left font-medium">สัปดาห์ (จ.)</th>
                <th className="px-1 font-medium">แคล/วัน</th>
                <th className="px-1 font-medium">ในเป้า</th>
                <th className="px-1 font-medium">น้ำหนักเฉลี่ย</th>
                <th className="px-1 font-medium">เปลี่ยน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.weeks.map((w) => (
                <tr key={w.start}>
                  <td className="px-1 py-1.5 text-left">{formatThaiDate(w.start)}</td>
                  <td className="px-1">{w.avgKcal !== undefined ? fmtInt(w.avgKcal) : '–'}</td>
                  <td className="px-1">{w.loggedDays ? `${w.onTarget}/${w.loggedDays}` : '–'}</td>
                  <td className="px-1">{w.avgWeight !== undefined ? fmt1(w.avgWeight) : '–'}</td>
                  <td className={`px-1 ${w.change === undefined ? '' : w.change <= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {w.change !== undefined ? `${w.change > 0 ? '+' : ''}${fmt1(w.change)}` : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">ค่าเฉลี่ยแคลไม่นับวันนี้ เพราะยังกินไม่ครบวัน</p>
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Tile({ label, value, unit, sub, tone }: { label: string; value: string; unit: string; sub: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-600' : 'text-slate-800'}`}>{value}</span>
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  )
}
