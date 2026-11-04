import type { Activity, Profile, Sex, WeightLog } from './db'

export const KCAL_PER_KG = 7700

export const ACTIVITY: Record<Activity, { label: string; factor: number }> = {
  sedentary: { label: 'นั่งทำงานเป็นหลัก ไม่ค่อยออกกำลังกาย', factor: 1.2 },
  light: { label: 'ออกกำลังกายเบาๆ 1–3 วัน/สัปดาห์', factor: 1.375 },
  moderate: { label: 'ออกกำลังกายปานกลาง 3–5 วัน/สัปดาห์', factor: 1.55 },
  active: { label: 'ออกกำลังกายหนัก 6–7 วัน/สัปดาห์', factor: 1.725 },
}

export const RATES = [0.25, 0.5, 0.75]

export const ageOf = (birthYear: number) => new Date().getFullYear() - birthYear

/** BMR ที่วัดจากเครื่อง ณ น้ำหนักตอนวัด */
export interface MeasuredBmr { kcal: number; weight: number }

/** Mifflin-St Jeor หรือค่าจากเครื่องวัด (ปรับตามน้ำหนักที่เปลี่ยน ~10 kcal/กก. ตามความชันของสูตร) */
export function bmr(p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm'>, weightKg: number, measured?: MeasuredBmr) {
  if (measured) return measured.kcal + 10 * (weightKg - measured.weight)
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * ageOf(p.birthYear)
  return base + (p.sex === 'male' ? 5 : -161)
}

export function tdee(p: Profile, weightKg: number, measured?: MeasuredBmr) {
  return bmr(p, weightKg, measured) * ACTIVITY[p.activity].factor
}

export const minKcal = (sex: Sex) => (sex === 'male' ? 1500 : 1200)

export function calorieTarget(p: Profile, weightKg: number, measured?: MeasuredBmr) {
  const t = tdee(p, weightKg, measured)
  const deficit = (p.ratePerWeek * KCAL_PER_KG) / 7
  const raw = t - deficit
  const floor = minKcal(p.sex)
  const target = Math.round(Math.max(raw, floor) / 10) * 10
  return {
    bmr: Math.round(bmr(p, weightKg, measured)),
    bmrSource: measured ? ('measured' as const) : ('formula' as const),
    tdee: Math.round(t),
    deficit: Math.round(deficit),
    target,
    floored: raw < floor,
  }
}

export function bmi(weightKg: number, heightCm: number) {
  const h = heightCm / 100
  return weightKg / (h * h)
}

/** เกณฑ์ BMI สำหรับคนเอเชีย */
export function bmiLabel(v: number) {
  if (v < 18.5) return 'น้ำหนักน้อย'
  if (v < 23) return 'ปกติ'
  if (v < 25) return 'ท้วม'
  if (v < 30) return 'อ้วน'
  return 'อ้วนมาก'
}

/** น้ำหนักล่าสุด ณ วันที่กำหนด (ใช้น้ำหนักเช้าเป็นหลัก) */
export function latestWeight(weights: WeightLog[], onOrBefore: string): number | undefined {
  const sorted = weights.filter((w) => w.date <= onOrBefore).sort((a, b) => b.date.localeCompare(a.date))
  for (const w of sorted) {
    const v = w.morningKg ?? w.eveningKg
    if (v) return v
  }
  return undefined
}

/** ค่าเฉลี่ยน้ำหนักเช้า 7 วันล่าสุด (นับรวมวันที่กำหนด) */
export function avg7(weights: WeightLog[], date: string, addDays: (d: string, n: number) => string) {
  const from = addDays(date, -6)
  const vals = weights
    .filter((w) => w.date >= from && w.date <= date && w.morningKg)
    .map((w) => w.morningKg!)
  if (!vals.length) return undefined
  return { value: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length }
}

export const fmt1 = (n: number) => n.toFixed(1)
export const fmtInt = (n: number) => Math.round(n).toLocaleString('th-TH')
