import type { MealEntry, Profile, WeightLog, Meal } from './db'
import { MEALS } from './db'
import { KCAL_PER_KG, avg7, calorieTarget, latestWeight, type MeasuredBmr } from './calc'
import { addDays } from './date'

export const dayIndex = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function dateRange(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function kcalByDate(entries: MealEntry[]) {
  const m = new Map<string, number>()
  for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + e.kcalPerUnit * e.qty)
  return m
}

/** ความชันของเส้นถดถอยเชิงเส้น (y ต่อ 1 หน่วย x) */
function slope(points: { x: number; y: number }[]) {
  const n = points.length
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0, den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return den === 0 ? 0 : num / den
}

/** แนวโน้มน้ำหนัก (กก./วัน) จากน้ำหนักเช้าใน N วันล่าสุด */
export function weightTrend(weights: WeightLog[], today: string, days = 28) {
  const from = addDays(today, -(days - 1))
  const pts = weights
    .filter((w) => w.morningKg && w.date >= from && w.date <= today)
    .map((w) => ({ x: dayIndex(w.date), y: w.morningKg! }))
  if (pts.length < 5) return undefined
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
  if (span < 7) return undefined
  return { perDay: slope(pts), points: pts.length, span }
}

export type Projection =
  | { status: 'reached' }
  | { status: 'insufficient'; planDate: string }
  | { status: 'not-losing'; perWeek: number }
  | { status: 'ok'; date: string; perWeek: number; weeks: number }

/** คาดการณ์วันที่จะถึงน้ำหนักเป้าหมายจากแนวโน้มจริง (ถ้าข้อมูลยังน้อย ใช้ตามแผน) */
export function projectGoal(profile: Profile, weights: WeightLog[], today: string): Projection {
  const current = avg7(weights, today, addDays)?.value ?? latestWeight(weights, today) ?? profile.startWeight
  const toGo = current - profile.goalWeight
  if (toGo <= 0) return { status: 'reached' }
  const t = weightTrend(weights, today)
  if (!t) {
    const days = Math.ceil((toGo / profile.ratePerWeek) * 7)
    return { status: 'insufficient', planDate: addDays(today, days) }
  }
  const perWeek = -t.perDay * 7
  if (perWeek < 0.05) return { status: 'not-losing', perWeek }
  const days = Math.ceil(toGo / -t.perDay)
  return { status: 'ok', date: addDays(today, days), perWeek, weeks: days / 7 }
}

/** ประมาณ TDEE จริงจากแคลที่กิน + น้ำหนักที่เปลี่ยน (ต้องบันทึกอย่างน้อย 14 วันใน 28 วัน) */
export function estimateRealTDEE(weights: WeightLog[], entries: MealEntry[], today: string) {
  const yesterday = addDays(today, -1)
  const from = addDays(yesterday, -27)
  const kcal = kcalByDate(entries.filter((e) => e.date >= from && e.date <= yesterday))
  if (kcal.size < 14) return undefined
  const t = weightTrend(weights, yesterday)
  if (!t) return undefined
  const avgKcal = [...kcal.values()].reduce((a, b) => a + b, 0) / kcal.size
  return { tdee: Math.round(avgKcal - t.perDay * KCAL_PER_KG), avgKcal, loggedDays: kcal.size }
}

export interface DaySummary {
  date: string
  kcal: number
  logged: boolean
  target: number
  morning?: number
  evening?: number
  avg7?: number
}

export function summarizeDays(profile: Profile, weights: WeightLog[], entries: MealEntry[], dates: string[], measured?: MeasuredBmr, bonus?: Map<string, number>): DaySummary[] {
  const kcal = kcalByDate(entries)
  const byDate = new Map(weights.map((w) => [w.date, w]))
  return dates.map((date) => {
    const w = byDate.get(date)
    const weight = latestWeight(weights, date) ?? profile.startWeight
    return {
      date,
      kcal: kcal.get(date) ?? 0,
      logged: kcal.has(date),
      target: calorieTarget(profile, weight, measured).target + (bonus?.get(date) ?? 0),
      morning: w?.morningKg,
      evening: w?.eveningKg,
      avg7: avg7(weights, date, addDays)?.value,
    }
  })
}

/** วันจันทร์ของสัปดาห์ */
export function weekStart(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay() // 0=อาทิตย์
  return addDays(date, -((dow + 6) % 7))
}

export interface WeekRow {
  start: string
  avgKcal?: number
  loggedDays: number
  onTarget: number
  avgWeight?: number
  change?: number
}

/** สรุปรายสัปดาห์ (ไม่นับวันนี้ในค่าเฉลี่ยแคล เพราะยังกินไม่ครบวัน) */
export function weeklyRows(days: DaySummary[], today: string): WeekRow[] {
  const groups = new Map<string, DaySummary[]>()
  for (const d of days) {
    const k = weekStart(d.date)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(d)
  }
  const rows: WeekRow[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, ds]) => {
      const logged = ds.filter((d) => d.logged && d.date !== today)
      const ws = ds.filter((d) => d.morning).map((d) => d.morning!)
      return {
        start,
        loggedDays: logged.length,
        onTarget: logged.filter((d) => d.kcal <= d.target).length,
        avgKcal: logged.length ? logged.reduce((s, d) => s + d.kcal, 0) / logged.length : undefined,
        avgWeight: ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : undefined,
      }
    })
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].avgWeight, b = rows[i].avgWeight
    if (a !== undefined && b !== undefined) rows[i].change = b - a
  }
  return rows.reverse()
}

export function mealShare(entries: MealEntry[]) {
  const total = entries.reduce((s, e) => s + e.kcalPerUnit * e.qty, 0)
  return MEALS.map((m) => {
    const k = entries.filter((e) => e.meal === m.key).reduce((s, e) => s + e.kcalPerUnit * e.qty, 0)
    return { ...m, kcal: k, share: total ? k / total : 0 }
  })
}

export function topFoods(entries: MealEntry[], n = 5) {
  const m = new Map<string, { name: string; kcal: number; times: number }>()
  for (const e of entries) {
    const r = m.get(e.name) ?? { name: e.name, kcal: 0, times: 0 }
    r.kcal += e.kcalPerUnit * e.qty
    r.times += 1
    m.set(e.name, r)
  }
  return [...m.values()].sort((a, b) => b.kcal - a.kcal).slice(0, n)
}

/** จำนวนวันติดต่อกันที่มีการบันทึก (อาหารหรือน้ำหนัก) นับถึงวันนี้หรือเมื่อวาน */
export function streak(weights: WeightLog[], entries: MealEntry[], today: string) {
  const has = new Set([...weights.map((w) => w.date), ...entries.map((e) => e.date)])
  let d = has.has(today) ? today : addDays(today, -1)
  let n = 0
  while (has.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export interface Insight { icon: string; text: string; tone: 'good' | 'warn' | 'info' }

export function insights(days: DaySummary[], entries: MealEntry[], today: string): Insight[] {
  const out: Insight[] = []
  const logged = days.filter((d) => d.logged && d.date !== today)
  if (logged.length < 3) return out
  const loggedSet = new Set(logged.map((d) => d.date))
  const used = entries.filter((e) => loggedSet.has(e.date))

  const on = logged.filter((d) => d.kcal <= d.target).length
  const pct = on / logged.length
  out.push({
    icon: pct >= 0.7 ? '🎯' : '📌',
    tone: pct >= 0.7 ? 'good' : 'warn',
    text: `กินไม่เกินเป้า ${on} จาก ${logged.length} วันที่บันทึก (${Math.round(pct * 100)}%)`,
  })

  const share = mealShare(used)
  const snack = share.find((s) => s.key === ('snack' as Meal))!
  if (snack.share >= 0.2) {
    out.push({ icon: '🍪', tone: 'warn', text: `ของกินระหว่างวันคิดเป็น ${Math.round(snack.share * 100)}% ของแคลทั้งหมด ลองลดขนม/เครื่องดื่มหวานดูเป็นจุดแรก` })
  }

  const isWeekend = (date: string) => {
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(y, m - 1, d).getDay()
    return dow === 0 || dow === 6
  }
  const we = logged.filter((d) => isWeekend(d.date))
  const wd = logged.filter((d) => !isWeekend(d.date))
  if (we.length >= 2 && wd.length >= 3) {
    const avg = (xs: DaySummary[]) => xs.reduce((s, d) => s + d.kcal, 0) / xs.length
    const diff = avg(we) - avg(wd)
    if (diff >= 200) {
      out.push({ icon: '📅', tone: 'warn', text: `เสาร์-อาทิตย์กินมากกว่าวันธรรมดาเฉลี่ย ${Math.round(diff).toLocaleString('th-TH')} kcal/วัน` })
    }
  }

  const top = topFoods(used, 1)[0]
  if (top) {
    const total = used.reduce((s, e) => s + e.kcalPerUnit * e.qty, 0)
    out.push({ icon: '🍽️', tone: 'info', text: `เมนูที่ให้แคลรวมมากที่สุด: ${top.name} (${top.times} ครั้ง, ${Math.round((top.kcal / total) * 100)}% ของทั้งหมด)` })
  }

  const withBoth = days.filter((d) => d.morning && d.evening)
  if (withBoth.length >= 3) {
    const avgGap = withBoth.reduce((s, d) => s + (d.evening! - d.morning!), 0) / withBoth.length
    out.push({ icon: '💧', tone: 'info', text: `น้ำหนักเย็นมากกว่าเช้าเฉลี่ย ${avgGap.toFixed(1)} กก. — เป็นน้ำและอาหาร ไม่ใช่ไขมัน` })
  }
  return out
}
