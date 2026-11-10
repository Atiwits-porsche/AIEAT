// ดัชนีชี้วัดต่างๆ: รูปร่าง, คุณภาพการลดน้ำหนัก, พฤติกรรมการกิน, คุณภาพอาหาร
import type { BodyScan, Meal, MealEntry, Profile, Sex, WeightLog } from './db'
import { builtinFood, type FoodCategory } from './foods'
import { entryNutrients, sumEntries, type CustomIndex, type Limits, type Nutrients } from './nutrition'
import { calorieTarget, latestWeight, type MeasuredBmr } from './calc'
import { addDays } from './date'
import { derive, type Scale } from './body'
import { estimateRealTDEE, weightTrend, type DaySummary } from './stats'

const kcalOf = (e: MealEntry) => e.kcalPerUnit * e.qty

// ======================= รูปร่าง (ต้องมีรอบเอว) =======================

/** รอบเอว ÷ ส่วนสูง — เกณฑ์ NICE: 0.4–0.49 ปกติ · 0.5–0.59 เพิ่มความเสี่ยง · ≥ 0.6 สูง (ใช้ได้ทุกเพศและเชื้อชาติ) */
export const whtr = (waistCm: number, heightCm: number) => waistCm / heightCm

export const whtrScale: Scale = {
  min: 0.35,
  max: 0.75,
  zones: [
    { to: 0.4, label: 'น้อย', tone: 'low' },
    { to: 0.5, label: 'ปกติ', tone: 'good' },
    { to: 0.6, label: 'เพิ่มความเสี่ยง', tone: 'warn' },
    { to: Infinity, label: 'สูง', tone: 'bad' },
  ],
}

/** Relative Fat Mass (Woolcott & Bergman 2018): ชาย 64 − 20×(ส่วนสูง/รอบเอว), หญิง 76 − 20×(ส่วนสูง/รอบเอว) */
export const rfm = (sex: Sex, waistCm: number, heightCm: number) => (sex === 'male' ? 64 : 76) - 20 * (heightCm / waistCm)

/** Body Roundness Index (Thomas 2013): 364.2 − 365.5 × √(1 − (เอว/2π)² ÷ (0.5×สูง)²) */
export function bri(waistCm: number, heightCm: number) {
  const a = (waistCm / (2 * Math.PI)) ** 2 / (0.5 * heightCm) ** 2
  return 364.2 - 365.5 * Math.sqrt(Math.max(0, 1 - a))
}

/** ช่วง BRI จากงานวิจัย JAMA Netw Open 2024 (ผู้ใหญ่สหรัฐฯ): กลุ่ม 4.45–5.45 ความเสี่ยงต่ำสุด, ≥ 6.91 เสี่ยงเสียชีวิตสูงขึ้น ~50% */
export const briScale: Scale = {
  min: 1,
  max: 12,
  zones: [
    { to: 3.41, label: 'ต่ำ', tone: 'low' },
    { to: 5.46, label: 'เสี่ยงต่ำ', tone: 'good' },
    { to: 6.91, label: 'เริ่มเสี่ยง', tone: 'warn' },
    { to: Infinity, label: 'เสี่ยงสูง', tone: 'bad' },
  ],
}

export function waistScale(sex: Sex, heightCm: number): Scale {
  const lim = waistLimit(sex, heightCm)
  return {
    min: lim - 25,
    max: lim + 30,
    zones: [
      { to: lim, label: 'ไม่เกินเกณฑ์', tone: 'good' },
      { to: lim + 10, label: 'เกินเกณฑ์', tone: 'warn' },
      { to: Infinity, label: 'เกินมาก', tone: 'bad' },
    ],
  }
}

/** เกณฑ์รอบเอวคนไทย (กรมอนามัย): ชาย < 90 ซม., หญิง < 80 ซม. และไม่เกินส่วนสูง ÷ 2 */
export const waistLimit = (sex: Sex, heightCm: number) => Math.min(sex === 'male' ? 90 : 80, heightCm / 2)

export function waistLogs(weights: WeightLog[]) {
  return weights.filter((w) => w.waistCm).sort((a, b) => a.date.localeCompare(b.date)) as (WeightLog & { waistCm: number })[]
}

// ======================= คุณภาพการลดน้ำหนัก =======================

export interface LossRate {
  perWeekKg: number
  /** % ของน้ำหนักตัวต่อสัปดาห์ (บวก = ลด) */
  pctPerWeek: number
  band: 'gain' | 'flat' | 'slow' | 'good' | 'ideal' | 'fast'
}

/** อัตราลดจากเส้นแนวโน้ม 28 วัน — เกณฑ์ปลอดภัย 0.5–1% ของน้ำหนักตัวต่อสัปดาห์ */
export function lossRate(weights: WeightLog[], today: string, current: number): LossRate | undefined {
  const t = weightTrend(weights, today, 28)
  if (!t) return undefined
  const perWeekKg = -t.perDay * 7
  const pctPerWeek = (perWeekKg / current) * 100
  const band = pctPerWeek < -0.1 ? 'gain' : pctPerWeek < 0.1 ? 'flat' : pctPerWeek < 0.25 ? 'slow'
    : pctPerWeek < 0.5 ? 'good' : pctPerWeek <= 1 ? 'ideal' : 'fast'
  return { perWeekKg, pctPerWeek, band }
}

export type Plateau =
  | { status: 'insufficient' }
  | { status: 'losing'; perWeekKg: number }
  | { status: 'plateau'; perWeekKg: number; avgKcal?: number; avgTarget: number; adherent: boolean; days: number }

/**
 * น้ำหนักนิ่ง: เส้นแนวโน้ม 21 วันล่าสุดลดน้อยกว่า 0.1 กก./สัปดาห์ (ต้องชั่งเช้า ≥ 10 วัน)
 * แยกว่า "กินตามเป้าแล้วยังนิ่ง" (นิ่งจริง) หรือ "แคลเกินเป้า"
 */
export function plateau(weights: WeightLog[], days: DaySummary[], complete: Set<string>, today: string): Plateau {
  const t = weightTrend(weights, today, 21)
  if (!t || t.points < 10 || t.span < 14) return { status: 'insufficient' }
  const perWeekKg = -t.perDay * 7
  if (perWeekKg >= 0.1) return { status: 'losing', perWeekKg }
  const from = addDays(today, -20)
  const win = days.filter((d) => d.date >= from && complete.has(d.date))
  const avgKcal = win.length ? win.reduce((s, d) => s + d.kcal, 0) / win.length : undefined
  const avgTarget = win.length ? win.reduce((s, d) => s + d.target, 0) / win.length : days[days.length - 1]?.target ?? 0
  return { status: 'plateau', perWeekKg, avgKcal, avgTarget, adherent: avgKcal !== undefined && avgKcal <= avgTarget + 100, days: win.length }
}

/** น้ำหนักที่ลดเป็นไขมันกี่ % (จากผลวัด Tanita ครั้งแรกในแผนเทียบล่าสุด) — ดี ≥ 75% */
export function fatLossShare(scans: BodyScan[], heightCm: number, since?: string) {
  const sorted = [...scans].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 2) return undefined
  const last = derive(sorted[sorted.length - 1], heightCm)
  const firstRaw = (since && sorted.find((s) => s.date >= since && s.date < last.date)) || sorted[0]
  const first = derive(firstRaw, heightCm)
  const lost = first.weight - last.weight
  const span = (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000
  if (span < 14 || lost < 1) return { first, last, lost, span, share: undefined }
  const fatLost = first.fatMass - last.fatMass
  const leanLost = first.ffm - last.ffm
  return { first, last, lost, span, fatLost, leanLost, share: fatLost / lost }
}

export interface Adaptation {
  real: number
  formula: number
  /** (จริง − สูตร) ÷ สูตร */
  pct: number
  prev?: { real: number; formula: number; pct: number }
}

/**
 * ระบบเผาผลาญชะลอ: เทียบ TDEE จริง (จากแคลที่กิน + แนวโน้มน้ำหนัก) กับ TDEE จากสูตรที่น้ำหนักเดียวกัน
 * สูตรคิดการลดลงตามน้ำหนักที่ลดไว้แล้ว ส่วนที่ต่ำกว่าสูตรเกิน ~10% อาจเป็นการปรับตัวของร่างกาย (หรือบันทึกอาหารไม่ครบ)
 */
export function adaptation(profile: Profile, weights: WeightLog[], entries: MealEntry[], today: string, measured?: MeasuredBmr): Adaptation | undefined {
  const at = (end: string) => {
    const r = estimateRealTDEE(weights, entries, end)
    if (!r) return undefined
    const w = latestWeight(weights, addDays(end, -1)) ?? profile.startWeight
    const formula = calorieTarget(profile, w, measured).tdee
    return { real: r.tdee, formula, pct: r.tdee / formula - 1 }
  }
  const now = at(today)
  if (!now) return undefined
  return { ...now, prev: at(addDays(today, -28)) }
}

// ======================= พฤติกรรมการกิน =======================

const MAIN: Meal[] = ['breakfast', 'lunch', 'dinner']

/** เวลากิน: ที่ระบุไว้ หรือเวลาที่บันทึก (ถ้าบันทึกในวันเดียวกัน) */
export function entryTime(e: MealEntry): string | undefined {
  if (e.time) return e.time
  const d = new Date(e.createdAt)
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (ds !== e.date) return undefined
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`

/** เวลาเริ่มต้นของแต่ละมื้อ (ใช้เมื่อบันทึกย้อนหลัง) */
export const MEAL_TIME: Record<Meal, string> = { breakfast: '07:30', lunch: '12:00', dinner: '18:30', snack: '15:00' }

export const LATE_FROM = 21 * 60 // มื้อดึก: หลัง 21:00 ถึงตี 4

const isLate = (t: string) => {
  const m = toMin(t)
  return m >= LATE_FROM || m < 4 * 60
}

/** วันที่น่าจะบันทึกไม่ครบ: แคลต่ำกว่า max(800, ครึ่งหนึ่งของเป้า) หรือมีมื้อหลักไม่ถึง 2 มื้อ */
export function incompleteDays(days: DaySummary[], entries: MealEntry[], today: string) {
  const meals = new Map<string, Set<Meal>>()
  for (const e of entries) {
    if (!meals.has(e.date)) meals.set(e.date, new Set())
    meals.get(e.date)!.add(e.meal)
  }
  const out = new Map<string, string>()
  for (const d of days) {
    if (!d.logged || d.date === today) continue
    const main = MAIN.filter((m) => meals.get(d.date)?.has(m)).length
    if (d.kcal < Math.max(800, d.target * 0.5)) out.set(d.date, `แคลแค่ ${Math.round(d.kcal).toLocaleString('th-TH')} kcal`)
    else if (main < 2) out.set(d.date, `มีมื้อหลัก ${main} มื้อ`)
  }
  return out
}

export interface Consistency {
  score: number
  days: number
  logged: number
  adherent: number
  weighed: number
}

/** คะแนนความสม่ำเสมอ = บันทึกครบ 40% + อยู่ในเป้า (ไม่เกิน 10%) 40% + ชั่งน้ำหนักเช้า 20% */
export function consistency(days: DaySummary[], complete: Set<string>, today: string): Consistency | undefined {
  const past = days.filter((d) => d.date < today).slice(-28)
  if (past.length < 3) return undefined
  const logged = past.filter((d) => complete.has(d.date))
  const adherent = logged.filter((d) => d.kcal <= d.target * 1.1).length
  const weighed = past.filter((d) => d.morning).length
  // วันที่อยู่ในเป้าคิดเทียบทุกวัน (วันที่ไม่ได้บันทึกไม่ได้คะแนน)
  const score = Math.round(40 * (logged.length / past.length) + 40 * (adherent / past.length) + 20 * (weighed / past.length))
  return { score, days: past.length, logged: logged.length, adherent, weighed }
}

export interface Timing {
  timedDays: number
  /** ช่วงเวลากินต่อวัน (นาที) ค่ามัธยฐาน */
  windowMin?: number
  firstMedian?: string
  lastMedian?: string
  lateDays: number
  lateKcalAvg: number
  noBreakfast: number
  loggedDays: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : undefined
}

export function timing(entries: MealEntry[], complete: Set<string>): Timing {
  const byDay = new Map<string, MealEntry[]>()
  for (const e of entries) {
    if (!complete.has(e.date)) continue
    if (!byDay.has(e.date)) byDay.set(e.date, [])
    byDay.get(e.date)!.push(e)
  }
  const windows: number[] = []
  const firsts: number[] = []
  const lasts: number[] = []
  let lateDays = 0
  let lateKcal = 0
  let noBreakfast = 0
  let timedDays = 0
  for (const list of byDay.values()) {
    if (!list.some((e) => e.meal === 'breakfast')) noBreakfast++
    const timed = list.map((e) => ({ e, t: entryTime(e) })).filter((x): x is { e: MealEntry; t: string } => !!x.t)
    if (!timed.length) continue
    timedDays++
    // นับเวลาหลังเที่ยงคืนถึงตี 4 เป็นของคืนก่อน
    const mins = timed.map((x) => { const m = toMin(x.t); return m < 240 ? m + 1440 : m })
    if (timed.length >= 2) {
      windows.push(Math.max(...mins) - Math.min(...mins))
      firsts.push(Math.min(...mins))
      lasts.push(Math.max(...mins))
    }
    const late = timed.filter((x) => isLate(x.t)).reduce((s, x) => s + kcalOf(x.e), 0)
    if (late >= 100) { lateDays++; lateKcal += late }
  }
  const f = median(firsts)
  const l = median(lasts)
  return {
    timedDays,
    windowMin: median(windows),
    firstMedian: f !== undefined ? fromMin(f) : undefined,
    lastMedian: l !== undefined ? fromMin(l) : undefined,
    lateDays,
    lateKcalAvg: lateDays ? lateKcal / lateDays : 0,
    noBreakfast,
    loggedDays: byDay.size,
  }
}

const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const dowOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

export interface Finding { icon: string; text: string }

/** หาว่าวัน/มื้อ/เมนู/เวลาไหน ทำให้เกินเป้าบ่อย */
export function overshootPatterns(days: DaySummary[], entries: MealEntry[], complete: Set<string>, mealLabel: Record<Meal, string>): { over: number; total: number; findings: Finding[] } {
  const ds = days.filter((d) => complete.has(d.date))
  const over = ds.filter((d) => d.kcal > d.target)
  const on = ds.filter((d) => d.kcal <= d.target)
  const findings: Finding[] = []
  if (ds.length < 7 || over.length < 2) return { over: over.length, total: ds.length, findings }
  const overSet = new Set(over.map((d) => d.date))
  const baseRate = over.length / ds.length

  // วันในสัปดาห์
  const dow = [...Array(7).keys()].map((i) => {
    const all = ds.filter((d) => dowOf(d.date) === i)
    const o = all.filter((d) => overSet.has(d.date))
    return { i, n: all.length, rate: all.length ? o.length / all.length : 0, extra: o.reduce((s, d) => s + d.kcal - d.target, 0) / Math.max(1, o.length) }
  }).filter((x) => x.n >= 2).sort((a, b) => b.rate - a.rate)
  if (dow[0] && dow[0].rate >= 0.5 && dow[0].rate >= baseRate + 0.2) {
    findings.push({ icon: '📅', text: `วัน${DOW[dow[0].i]}เกินเป้าบ่อยสุด (${Math.round(dow[0].rate * 100)}% ของวัน${DOW[dow[0].i]}) เกินเฉลี่ย ${Math.round(dow[0].extra).toLocaleString('th-TH')} kcal` })
  }

  // มื้อ: แคลเฉลี่ยของแต่ละมื้อ วันเกินเป้าเทียบวันปกติ
  const mealAvg = (set: DaySummary[], m: Meal) => set.reduce((s, d) => s + entries.filter((e) => e.date === d.date && e.meal === m).reduce((a, e) => a + kcalOf(e), 0), 0) / Math.max(1, set.length)
  if (on.length >= 2) {
    const diffs = (['breakfast', 'lunch', 'dinner', 'snack'] as Meal[]).map((m) => ({ m, d: mealAvg(over, m) - mealAvg(on, m) })).sort((a, b) => b.d - a.d)
    if (diffs[0].d >= 150) {
      findings.push({ icon: '🍽️', text: `วันที่เกินเป้า ${mealLabel[diffs[0].m]}มากกว่าวันปกติเฉลี่ย ${Math.round(diffs[0].d).toLocaleString('th-TH')} kcal — เป็นมื้อที่ทำให้หลุดเป้า` })
    }
  }

  // เมนูที่โผล่ในวันเกินเป้ามากกว่าวันปกติ
  if (on.length >= 2) {
    const present = (set: DaySummary[]) => {
      const m = new Map<string, number>()
      for (const d of set) for (const name of new Set(entries.filter((e) => e.date === d.date).map((e) => e.name))) m.set(name, (m.get(name) ?? 0) + 1)
      return m
    }
    const po = present(over)
    const pn = present(on)
    const foods = [...po.entries()]
      .filter(([, c]) => c >= 2)
      .map(([name, c]) => ({ name, lift: c / over.length - (pn.get(name) ?? 0) / on.length, c }))
      .filter((x) => x.lift >= 0.25)
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 3)
    if (foods.length) {
      findings.push({ icon: '🔎', text: `เมนูที่มักเจอในวันเกินเป้า: ${foods.map((f) => `${f.name} (${f.c}/${over.length} วัน)`).join(', ')}` })
    }
  }

  // มื้อดึก
  const lateOf = (d: DaySummary) => entries.some((e) => e.date === d.date && (() => { const t = entryTime(e); return !!t && isLate(t) })())
  const lo = over.filter(lateOf).length / over.length
  const ln = on.length ? on.filter(lateOf).length / on.length : 0
  if (lo >= 0.4 && lo >= ln + 0.2) {
    findings.push({ icon: '🌙', text: `${Math.round(lo * 100)}% ของวันที่เกินเป้ามีการกินหลัง 3 ทุ่ม (วันปกติ ${Math.round(ln * 100)}%)` })
  }
  return { over: over.length, total: ds.length, findings }
}

// ======================= คุณภาพอาหาร =======================

/** ผัก/ผลไม้ ต่อ 1 หน่วย (หน่วยบริโภค ≈ 80 g) — ค่าประมาณจากชื่อเมนู */
const VF_RULES: [RegExp, number][] = [
  [/ชุดผัก|น้ำพริก.*ผัก|ผักต้ม|ผักลวก/, 2],
  [/สลัดสาหร่าย/, 0.5],
  [/สลัด|ผัดผัก(?!รวมราดข้าว)|ผักบุ้ง|ผักรวม|ส้มตำ|แกงเลียง/, 1.5],
  [/ผัดผักรวมราดข้าว|แกงส้ม|ต้มจืด|ข้าวโพดต้ม|แกงกะหรี่ผัก|ชุดปิ้งย่าง/, 1],
  [/แกงจืด|ยำ|ลาบ|กะหล่ำ|ผัดไทย|ผัดเปรี้ยวหวาน/, 0.5],
  [/ก๋วยเตี๋ยว|แกงเขียวหวาน|แกงป่า|ต้มยำ|ราดหน้า|สุกี้/, 0.3],
]
const FRUIT_JUICE = /น้ำ.*ปั่น|น้ำผลไม้|น้ำส้ม|สมูทตี้/

export function vegFruitPerUnit(name: string, unit: string): number {
  const f = builtinFood(name, unit)
  if (f?.cat === 'ผลไม้' || /^(กล้วย|ผลไม้ตัดแต่ง)/.test(name)) {
    if (FRUIT_JUICE.test(name)) return 0
    return /จาน|ถุง/.test(unit) ? 1.5 : 1
  }
  for (const [re, v] of VF_RULES) if (re.test(name)) return v
  return 0
}

const DRINK_CATS: FoodCategory[] = ['กาแฟ/ชา/นม', 'น้ำหวาน/น้ำผลไม้/น้ำอัดลม', 'แอลกอฮอล์', 'เซเว่น: นมโปรตีน/เครื่องดื่ม']
export function isDrink(name: string, unit: string) {
  if (unit === 'ถ้วย') return false
  const f = builtinFood(name, unit)
  if (f) return DRINK_CATS.includes(f.cat) || /เครื่องดื่ม|น้ำอัดลม|ลาเต้|กาแฟ|อเมริกาโน่|แฟรปปูชิโน่|มอคค่า/.test(f.name)
  return /แก้ว|ขวด|กระป๋อง/.test(unit)
}

export const VF_GOAL = 5 // ส่วน/วัน ≈ 400 g (WHO)
export const PROTEIN_PER_MEAL = 20

export interface DayQuality {
  score: number
  parts: { key: 'vf' | 'protein' | 'sugar' | 'fat' | 'sodium'; label: string; got: number; max: number }[]
  vf: number
  total: Nutrients
  /** โปรตีนแต่ละมื้อหลักที่กิน */
  mealProtein: { meal: Meal; protein: number }[]
  drinkSugar: number
  drinkKcal: number
  /** เครื่องดื่มที่มีน้ำตาล เรียงจากมากไปน้อย */
  drinks: { name: string; sugar: number }[]
  kcal: number
}

/** คะแนนคุณภาพอาหาร 0–100: ผักผลไม้ 25 · โปรตีน 20 · น้ำตาล 20 · โซเดียม 20 · ไขมัน 15 */
export function dayQuality(entries: MealEntry[], limits: Limits, custom?: CustomIndex): DayQuality {
  const s = sumEntries(entries, custom).total
  const vf = entries.reduce((a, e) => a + vegFruitPerUnit(e.name, e.unit) * e.qty, 0)
  const capped = (v: number, lim: number) => (v <= lim ? 1 : Math.max(0, 1 - (v - lim) / lim))
  const parts: DayQuality['parts'] = [
    { key: 'vf', label: 'ผักผลไม้', got: 25 * Math.min(1, vf / VF_GOAL), max: 25 },
    { key: 'protein', label: 'โปรตีน', got: 20 * Math.min(1, limits.protein ? s.protein / limits.protein : 0), max: 20 },
    { key: 'sugar', label: 'น้ำตาล', got: 20 * capped(s.sugar, limits.sugar), max: 20 },
    { key: 'sodium', label: 'โซเดียม', got: 20 * capped(s.sodium, limits.sodium), max: 20 },
    { key: 'fat', label: 'ไขมัน', got: 15 * capped(s.fat, limits.fat), max: 15 },
  ]
  const mealProtein = MAIN
    .map((m) => ({ m, list: entries.filter((e) => e.meal === m) }))
    .filter((x) => x.list.length)
    .map((x) => ({ meal: x.m, protein: x.list.reduce((a, e) => a + (entryNutrients(e, custom)?.protein ?? 0), 0) }))
  const drinks = entries.filter((e) => isDrink(e.name, e.unit))
  return {
    score: Math.round(parts.reduce((a, p) => a + p.got, 0)),
    parts,
    vf,
    total: s,
    mealProtein,
    drinkSugar: drinks.reduce((a, e) => a + (entryNutrients(e, custom)?.sugar ?? 0), 0),
    drinkKcal: drinks.reduce((a, e) => a + kcalOf(e), 0),
    drinks: drinks
      .map((e) => ({ name: e.qty !== 1 ? `${e.name} ×${+e.qty.toFixed(2)}` : e.name, sugar: entryNutrients(e, custom)?.sugar ?? 0 }))
      .filter((d) => d.sugar >= 0.5)
      .sort((a, b) => b.sugar - a.sugar),
    kcal: entries.reduce((a, e) => a + kcalOf(e), 0),
  }
}

const MEAL_TH: Record<Meal, string> = { breakfast: 'มื้อเช้า', lunch: 'มื้อกลางวัน', dinner: 'มื้อเย็น', snack: 'ของว่าง' }

/** ด้านที่คะแนนต่ำสุดของวัน (undefined = ทุกด้าน ≥ 80%) */
export function weakestPart(q: DayQuality) {
  const w = [...q.parts].sort((a, b) => a.got / a.max - b.got / b.max)[0]
  return w && w.got / w.max < 0.8 ? w : undefined
}

/** คำแนะนำ 1 บรรทัดสำหรับวันนั้น อิงด้านที่อ่อนที่สุดและมื้อหลักที่ยังไม่ได้กิน */
export function dayTip(q: DayQuality, limits: Limits): string {
  const w = weakestPart(q)
  if (!w) return 'วันนี้กินได้สมดุลดีแล้ว 👍'
  const left = MAIN.filter((m) => !q.mealProtein.some((x) => x.meal === m))
  const next = left.length === 1 ? MEAL_TH[left[0]] : left.length ? 'มื้อที่เหลือ' : undefined
  const t = q.total
  switch (w.key) {
    case 'vf': {
      const need = Math.max(1, Math.ceil(VF_GOAL - q.vf))
      return next
        ? `${next}เพิ่มผักผลไม้อีก ${need} ส่วน${need < VF_GOAL ? ` ก็ครบ ${VF_GOAL}` : ''} (ผัดผัก/ต้มจืด 1 จาน ≈ 1–2 ส่วน · ผลไม้ 1 กำมือ = 1 ส่วน)`
        : `ผักผลไม้ได้ ${q.vf.toFixed(1)}/${VF_GOAL} ส่วน — พรุ่งนี้สั่งผักเพิ่ม 1 จาน หรือกินผลไม้แทนขนม`
    }
    case 'protein': {
      const need = Math.max(0, Math.round(limits.protein - t.protein))
      return next
        ? `${next}เลือกเมนูโปรตีนสูงอีก ~${need} g (อกไก่ 100 g ≈ 31 g · ไข่ 1 ฟอง ≈ 6 g · นมโปรตีน 1 ขวด ≈ 25–35 g)`
        : `โปรตีนขาด ${need} g — พรุ่งนี้เพิ่มไข่/อกไก่/เต้าหู้ในมื้อเช้า`
    }
    case 'sugar': {
      const top = q.drinks[0]
      return top && top.sugar >= t.sugar * 0.3
        ? `น้ำตาลส่วนใหญ่มาจาก "${top.name}" (${Math.round(top.sugar)} g) — ครั้งหน้าสั่งหวานน้อยหรือไม่หวาน`
        : `น้ำตาลเกินโควตาแล้ว — ที่เหลือของวันเลี่ยงขนมและเครื่องดื่มหวาน`
    }
    case 'sodium':
      return next
        ? `โซเดียมเกินแล้ว — ${next}เลี่ยงน้ำซุป น้ำจิ้ม และอาหารแปรรูป ดื่มน้ำเปล่าเพิ่ม`
        : 'โซเดียมเกิน — พรุ่งเช้าน้ำหนักอาจขึ้นจากน้ำ ไม่ใช่ไขมัน · ดื่มน้ำเปล่าเพิ่ม'
    case 'fat':
      return next
        ? `ไขมันเกินแล้ว — ${next}เลือกต้ม/นึ่ง/ย่าง แทนของทอดหรือกะทิ`
        : 'ไขมันเกิน — ครั้งหน้าเลือกต้ม/นึ่ง/ย่าง แทนของทอดหรือกะทิ'
  }
}

export function gradeOf(score: number) {
  if (score >= 80) return { label: 'ดีมาก', color: 'text-emerald-700' }
  if (score >= 60) return { label: 'ดี', color: 'text-sky-700' }
  if (score >= 40) return { label: 'พอใช้', color: 'text-amber-700' }
  return { label: 'ต้องปรับ', color: 'text-red-600' }
}
