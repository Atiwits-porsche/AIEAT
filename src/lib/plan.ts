import type { Profile, WeightLog } from './db'
import { avg7, latestWeight } from './calc'
import { addDays, toDateStr } from './date'
import { dayIndex, weightTrend } from './stats'

export function addMonths(date: string, m: number) {
  const [y, mo, d] = date.split('-').map(Number)
  return toDateStr(new Date(y, mo - 1 + m, d))
}

export interface Plan {
  start: string
  startWeight: number
  end: string
  goal: number
  months: number
  custom: boolean
}

export function currentWeight(profile: Profile, weights: WeightLog[], today: string) {
  return avg7(weights, today, addDays)?.value ?? latestWeight(weights, today) ?? profile.startWeight
}

/** แผนที่ผู้ใช้ตั้งไว้ หรือแผนเริ่มต้นจากความเร็วที่เลือกในโปรไฟล์ */
export function getPlan(profile: Profile, weights: WeightLog[]): Plan {
  if (profile.planStartDate && profile.planStartWeight && profile.planMonths) {
    return {
      start: profile.planStartDate,
      startWeight: profile.planStartWeight,
      end: addMonths(profile.planStartDate, profile.planMonths),
      goal: profile.goalWeight,
      months: profile.planMonths,
      custom: true,
    }
  }
  const first = [...weights].filter((w) => w.morningKg ?? w.eveningKg).sort((a, b) => a.date.localeCompare(b.date))[0]
  const start = first && first.date < profile.createdAt ? first.date : profile.createdAt
  const toLose = Math.max(0, profile.startWeight - profile.goalWeight)
  const months = Math.max(1, Math.ceil((toLose / profile.ratePerWeek) * 7 / 30.44))
  return { start, startWeight: profile.startWeight, end: addMonths(start, months), goal: profile.goalWeight, months, custom: false }
}

/** น้ำหนักตามแผน ณ วันที่กำหนด (ลดแบบเส้นตรง) */
export function planAt(plan: Plan, date: string) {
  const a = dayIndex(plan.start), b = dayIndex(plan.end), x = dayIndex(date)
  if (x <= a) return plan.startWeight
  if (x >= b) return plan.goal
  return plan.startWeight + ((plan.goal - plan.startWeight) * (x - a)) / (b - a)
}

/** ความเร็วที่ต้องลดจากวันนี้จนถึงวันสิ้นสุดแผน (กก./สัปดาห์) */
export function requiredRate(plan: Plan, current: number, today: string) {
  const weeks = (dayIndex(plan.end) - dayIndex(today)) / 7
  if (weeks <= 0) return undefined
  return Math.max(0, (current - plan.goal) / weeks)
}

/** เส้นแนวโน้มจริง (kg/วัน) จาก 28 วันล่าสุด */
export const trendPerDay = (weights: WeightLog[], today: string) => weightTrend(weights, today)?.perDay
