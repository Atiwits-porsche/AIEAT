import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CheatMeal, type Meal, type Profile } from './db'
import { addDays } from './date'

export const cheatId = (date: string, meal: Meal) => `${date}|${meal}`

/**
 * โควตาที่แนะนำต่อเดือนตามความเร็วของแผน
 * แนวทางทั่วไปคือ ~1 มื้อต่อสัปดาห์ (หลัก 80/20 / 90/10) — แผนยิ่งเร่ง ยิ่งเหลือที่ให้ cheat น้อย
 */
export function recommendedCheats(p: Profile) {
  if (p.ratePerWeek >= 0.7) return 2
  if (p.ratePerWeek >= 0.4) return 4
  return 6
}
export const cheatQuota = (p: Profile) => p.cheatPerMonth ?? recommendedCheats(p)

export const monthStart = (d: string) => `${d.slice(0, 7)}-01`
export function monthEnd(d: string) {
  const [y, m] = d.split('-').map(Number)
  return addDays(`${d.slice(0, 7)}-01`, new Date(y, m, 0).getDate() - 1)
}
export function shiftMonth(d: string, n: number) {
  const [y, m] = d.split('-').map(Number)
  const x = new Date(y, m - 1 + n, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`
}

export function useCheatsBetween(from: string, to: string) {
  return useLiveQuery(() => db.cheats.where('date').between(from, to, true, true).toArray(), [from, to])
}

export async function setCheat(date: string, meal: Meal, on: boolean) {
  const id = cheatId(date, meal)
  if (on) await db.cheats.put({ id, date, meal, createdAt: Date.now() })
  else await db.cheats.delete(id)
}

export const countIn = (list: CheatMeal[], from: string, to: string) => list.filter((c) => c.date >= from && c.date <= to).length
