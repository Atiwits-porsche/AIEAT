import type { CustomFood, MealEntry, Profile } from './db'
import { builtinNutrients } from './foods'
import { addDays } from './date'

/** สารอาหารต่อหน่วย: โปรตีน/ไขมัน/น้ำตาล เป็นกรัม, โซเดียมเป็นมิลลิกรัม */
export interface Nutrients {
  protein: number
  fat: number
  sugar: number
  sodium: number
}
export type NutKey = keyof Nutrients

export const NUT_KEYS: NutKey[] = ['sugar', 'fat', 'sodium', 'protein']

export const NUT: Record<NutKey, { label: string; unit: string; icon: string; kind: 'limit' | 'goal' }> = {
  sugar: { label: 'น้ำตาล', unit: 'g', icon: '🍬', kind: 'limit' },
  fat: { label: 'ไขมัน', unit: 'g', icon: '🧈', kind: 'limit' },
  sodium: { label: 'โซเดียม', unit: 'มก.', icon: '🧂', kind: 'limit' },
  protein: { label: 'โปรตีน', unit: 'g', icon: '🍗', kind: 'goal' },
}

export const ZERO: Nutrients = { protein: 0, fat: 0, sugar: 0, sodium: 0 }

export const scaleN = (n: Nutrients, k: number): Nutrients => ({
  protein: n.protein * k, fat: n.fat * k, sugar: n.sugar * k, sodium: n.sodium * k,
})
export const addN = (a: Nutrients, b: Nutrients): Nutrients => ({
  protein: a.protein + b.protein, fat: a.fat + b.fat, sugar: a.sugar + b.sugar, sodium: a.sodium + b.sodium,
})

/** แสดงตัวเลขให้อ่านง่าย: โซเดียมเป็นจำนวนเต็ม, กรัมน้อยกว่า 10 มีทศนิยม 1 ตำแหน่ง */
export function fmtN(key: NutKey, v: number) {
  if (key === 'sodium' || v >= 10) return Math.round(v).toLocaleString('th-TH')
  return (Math.round(v * 10) / 10).toLocaleString('th-TH')
}

export const SUGAR_G_PER_TSP = 4 // น้ำตาลทราย 1 ช้อนชา ≈ 4 กรัม
export const SODIUM_MG_PER_TSP_SALT = 2000 // เกลือ 1 ช้อนชา (~5 g) ≈ โซเดียม 2,000 มก.

// ---------- ค้นสารอาหารของรายการที่บันทึก ----------

export type CustomIndex = Map<string, Nutrients>
export const customIndex = (list: CustomFood[]): CustomIndex =>
  new Map(list.filter((c) => c.n).map((c) => [`${c.name}|${c.unit}`, c.n!]))

/** สารอาหารต่อ 1 หน่วยของรายการ: ค่าที่บันทึกไว้ → เมนูของฉัน/ค่าที่แก้เอง → ฐานข้อมูลเมนู */
export function perUnit(e: Pick<MealEntry, 'n' | 'name' | 'unit'>, custom?: CustomIndex) {
  return e.n ?? custom?.get(`${e.name}|${e.unit}`) ?? builtinNutrients(e.name, e.unit)
}

export function entryNutrients(e: MealEntry, custom?: CustomIndex) {
  const n = perUnit(e, custom)
  return n && scaleN(n, e.qty)
}

export interface NutSum {
  total: Nutrients
  /** จำนวนรายการที่ไม่มีข้อมูลสารอาหาร */
  unknown: number
  count: number
}

export function sumEntries(entries: MealEntry[], custom?: CustomIndex): NutSum {
  let total = ZERO
  let unknown = 0
  for (const e of entries) {
    const n = entryNutrients(e, custom)
    if (n) total = addN(total, n)
    else unknown++
  }
  return { total, unknown, count: entries.length }
}

export function byDate(entries: MealEntry[], custom?: CustomIndex) {
  const m = new Map<string, MealEntry[]>()
  for (const e of entries) {
    const l = m.get(e.date)
    if (l) l.push(e)
    else m.set(e.date, [e])
  }
  const out = new Map<string, NutSum>()
  for (const [d, l] of m) out.set(d, sumEntries(l, custom))
  return out
}

// ---------- เกณฑ์ต่อวัน ----------

export interface Limits extends Nutrients {
  /** โปรตีนช่วงบน (กรัม) */
  proteinHigh: number
  /** น้ำหนักที่ใช้คิดโปรตีน */
  refWeight: number
  /** ใช้น้ำหนักอ้างอิงแทนน้ำหนักจริง (BMI ≥ 30) */
  adjusted: boolean
  /** เป้าแคลของแผนที่ใช้คิดไขมัน/น้ำตาล */
  kcal: number
  /** น้ำตาลถูกลดจาก 24 g ตามเป้าแคล (5% ของพลังงาน) */
  sugarScaled: boolean
  /** โปรตีนกี่กรัมต่อ กก. */
  proteinPerKg: number
  /** เหตุผลที่เพิ่มโปรตีน (ถ้ามี) */
  proteinBoost?: string
}

export const FAT_PCT = 0.3
export const SUGAR_PCT = 0.05
export const PROTEIN_G_PER_KG = 1.2
export const PROTEIN_G_PER_KG_BOOST = 1.4
export const PROTEIN_G_PER_KG_HIGH = 1.6
export const FAST_RATE = 0.7
export const SUGAR_LIMIT_G = 24
export const SODIUM_LIMIT_MG = 2000

/**
 * เกณฑ์ต่อวัน ผูกกับแผนลดน้ำหนัก
 * - ไขมัน: 30% ของเป้าแคล → แผนยิ่งเร่ง เป้าแคลยิ่งต่ำ โควตายิ่งลด
 * - น้ำตาล: ค่าที่ต่ำกว่าระหว่าง 24 g กับ 5% ของเป้าแคล (WHO แนะนำ < 5% ของพลังงาน)
 * - โซเดียม: คงที่ 2,000 มก. — ไม่มีแคลอรี่ ไม่ได้ทำให้ไขมันลดเร็วขึ้น แต่ทำให้บวมน้ำ
 * - โปรตีน: 1.2 g/กก. · แผนเร่ง (≥ 0.7 กก./สัปดาห์) หรือนับแคลออกกำลังกาย → 1.4 g/กก. เพื่อรักษากล้ามเนื้อ
 */
export function dailyLimits(p: Profile, weight: number, targetKcal: number): Limits {
  const h = p.heightCm / 100
  const bmi = weight / (h * h)
  // คนที่ BMI สูงมาก คิดโปรตีนจากน้ำหนักจริงจะสูงเกินความจำเป็น → ใช้น้ำหนักเป้าหมาย/น้ำหนักที่ BMI 25 แทน
  const adjusted = bmi >= 30
  const refWeight = adjusted ? Math.max(p.goalWeight, 25 * h * h) : weight
  const sugarByKcal = Math.round((targetKcal * SUGAR_PCT) / 4)
  const proteinBoost =
    p.ratePerWeek >= FAST_RATE ? `แผนเร่ง ${p.ratePerWeek} กก./สัปดาห์` : p.addExercise ? 'ออกกำลังกายและนับแคลคืน' : undefined
  const proteinPerKg = proteinBoost ? PROTEIN_G_PER_KG_BOOST : PROTEIN_G_PER_KG
  return {
    sugar: Math.min(SUGAR_LIMIT_G, sugarByKcal),
    fat: Math.round((targetKcal * FAT_PCT) / 9),
    sodium: SODIUM_LIMIT_MG,
    protein: Math.round(refWeight * proteinPerKg),
    proteinHigh: Math.round(refWeight * PROTEIN_G_PER_KG_HIGH),
    refWeight,
    adjusted,
    kcal: targetKcal,
    sugarScaled: sugarByKcal < SUGAR_LIMIT_G,
    proteinPerKg,
    proteinBoost,
  }
}

/**
 * โซเดียมกับน้ำหนักเช้าวันถัดไป: เทียบวันที่โซเดียมเกินเกณฑ์กับวันปกติ
 * คืนค่าเมื่อมีข้อมูลพอ (แต่ละกลุ่ม ≥ 2 คู่วัน)
 */
export function sodiumWaterEffect(
  days: { date: string; morning?: number }[], sums: Map<string, NutSum>, limit: number,
) {
  const morning = new Map(days.filter((d) => d.morning).map((d) => [d.date, d.morning!]))
  const high: number[] = []
  const normal: number[] = []
  for (const [date, s] of sums) {
    if (!s.count) continue
    const w0 = morning.get(date)
    const w1 = morning.get(addDays(date, 1))
    if (w0 === undefined || w1 === undefined) continue
    ;(s.total.sodium > limit ? high : normal).push(w1 - w0)
  }
  if (high.length < 2 || normal.length < 2) return undefined
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return { highDays: high.length, highAvg: avg(high), normalAvg: avg(normal) }
}

/** ที่มาของเกณฑ์ — ค่าจากหลายหน่วยงาน แล้วใช้ค่ากลาง */
export const GUIDES: Record<NutKey, { sources: [string, string][]; chosen: string; note?: string }> = {
  sugar: {
    sources: [
      ['องค์การอนามัยโลก (WHO 2015)', '< 10% ของพลังงาน และแนะนำ < 5% ≈ 25 g'],
      ['กรมอนามัย กระทรวงสาธารณสุข', 'ไม่เกิน 6 ช้อนชา ≈ 24 g'],
      ['American Heart Association', 'ผู้หญิง ≤ 25 g · ผู้ชาย ≤ 36 g'],
    ],
    chosen: 'ค่ากลาง ≈ 24–25 g → ใช้ 24 g (6 ช้อนชา) ต่อวัน หรือ 5% ของเป้าแคลถ้าน้อยกว่า (ช่วงลดน้ำหนักกินแคลน้อยลง น้ำตาลก็ควรลดตามสัดส่วน)',
    note: 'นับเฉพาะน้ำตาลที่เติม น้ำเชื่อม น้ำผึ้ง และน้ำผลไม้ (ไม่นับน้ำตาลในผลไม้สดทั้งผลและนมจืด)',
  },
  fat: {
    sources: [
      ['องค์การอนามัยโลก (WHO 2023)', 'ไม่เกิน 30% ของพลังงาน'],
      ['ฉลาก GDA ไทย (อย.)', '65 g ต่อ 2,000 kcal ≈ 29%'],
      ['Dietary Guidelines for Americans', '20–35% ของพลังงาน'],
      ['ปริมาณอ้างอิงคนไทย (DRI)', '20–35% ของพลังงาน'],
    ],
    chosen: 'ค่ากลางเพดาน ≈ 30–35% → ใช้ 30% ของเป้าแคล (เข้มกว่าเล็กน้อย เหมาะกับช่วงลดน้ำหนัก)',
    note: 'คิดจากเป้าแคลต่อวันของคุณ ÷ 9 kcal ต่อไขมัน 1 กรัม',
  },
  sodium: {
    sources: [
      ['องค์การอนามัยโลก (WHO)', '< 2,000 มก. (เกลือ 5 g)'],
      ['กระทรวงสาธารณสุข', 'ไม่เกิน 2,000 มก. · มื้อละไม่เกิน ~600 มก.'],
      ['American Heart Association', 'ควร ≤ 1,500 มก. · ไม่เกิน 2,300 มก.'],
      ['Dietary Guidelines for Americans', '< 2,300 มก.'],
    ],
    chosen: 'ค่ากลาง = 2,000 มก. ต่อวัน (≈ เกลือ 1 ช้อนชา) — ไม่ผูกกับแผน เพราะโซเดียมไม่มีแคลอรี่',
    note: 'คนไทยกินโซเดียมเฉลี่ย ~3,600–4,000 มก./วัน ส่วนใหญ่มาจากน้ำปลา ซีอิ๊ว ผงปรุงรส น้ำซุป · วันที่กินเค็มทำให้ร่างกายเก็บน้ำ น้ำหนักเช้าวันรุ่งขึ้นขึ้นได้ 0.5–1 กก. แล้วลงเองใน 2–3 วัน ไม่ใช่ไขมัน',
  },
  protein: {
    sources: [
      ['WHO / RDA ทั่วไป', '0.8 g ต่อ กก. (ขั้นต่ำสำหรับคนทั่วไป)'],
      ['แนวทางช่วงลดน้ำหนัก (หลายงานวิจัย)', '1.2–1.6 g ต่อ กก.'],
      ['งานทบทวนปี 2024', '1.0–1.5 g ต่อ กก. · ถ้าออกกำลังกาย 1.4–2.0'],
      ['ISSN (สายออกกำลังกาย)', '1.6–2.2 g ต่อ กก.'],
    ],
    chosen: 'ค่ากลาง ≈ 1.2 g ต่อ กก. → เป้าขั้นต่ำต่อวัน (ช่วงดี 1.2–1.6) · แผนเร่ง ≥ 0.7 กก./สัปดาห์ หรือออกกำลังกายและนับแคลคืน → 1.4 g ต่อ กก.',
    note: 'โปรตีนพอช่วยรักษากล้ามเนื้อและอิ่มนานขณะลดแคล — ถ้า BMI ≥ 30 คิดจากน้ำหนักเป้าหมายแทน · ผู้ป่วยโรคไตควรปรึกษาแพทย์',
  },
}

// ---------- สรุปเป็นช่วง วัน / สัปดาห์ / เดือน ----------

export type Period = 'day' | 'week' | 'month'

export interface PeriodRow {
  start: string
  end: string
  /** จำนวนวันในช่วง (ใช้คูณเกณฑ์ต่อวัน) */
  days: number
  /** วันที่มีบันทึกอาหาร */
  logged: number
  total: Nutrients
  unknown: number
  /** ช่วงปัจจุบันที่ยังไม่จบ */
  partial: boolean
}

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

function mondayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return addDays(date, -((dow + 6) % 7))
}

export function periodRows(sums: Map<string, NutSum>, period: Period, from: string, today: string): PeriodRow[] {
  const rows: PeriodRow[] = []
  let start = period === 'week' ? mondayOf(from) : period === 'month' ? `${from.slice(0, 8)}01` : from
  while (start <= today) {
    let end: string
    let days: number
    if (period === 'day') { end = start; days = 1 }
    else if (period === 'week') { end = addDays(start, 6); days = 7 }
    else {
      const [y, m] = start.split('-').map(Number)
      days = daysInMonth(y, m)
      end = addDays(start, days - 1)
    }
    let total = ZERO
    let logged = 0
    let unknown = 0
    for (let d = start; d <= end && d <= today; d = addDays(d, 1)) {
      const s = sums.get(d)
      if (!s || !s.count) continue
      logged++
      unknown += s.unknown
      total = addN(total, s.total)
    }
    rows.push({ start, end, days, logged, total, unknown, partial: end >= today })
    start = addDays(end, 1)
  }
  return rows
}

/** เมนูที่ให้สารอาหารนั้นมากที่สุด */
export function topContributors(entries: MealEntry[], key: NutKey, custom?: CustomIndex, n = 5) {
  const m = new Map<string, { name: string; value: number; times: number }>()
  for (const e of entries) {
    const v = entryNutrients(e, custom)?.[key]
    if (!v) continue
    const r = m.get(e.name) ?? { name: e.name, value: 0, times: 0 }
    r.value += v
    r.times++
    m.set(e.name, r)
  }
  return [...m.values()].sort((a, b) => b.value - a.value).slice(0, n)
}

/** สถานะของค่าเทียบเกณฑ์: limit ยิ่งน้อยยิ่งดี, goal ต้องถึง */
export function status(key: NutKey, value: number, limit: number): 'ok' | 'near' | 'over' | 'low' {
  const r = limit ? value / limit : 0
  if (NUT[key].kind === 'goal') return r >= 1 ? 'ok' : r >= 0.7 ? 'near' : 'low'
  return r > 1 ? 'over' : r >= 0.8 ? 'near' : 'ok'
}

export const TIPS: Record<NutKey, string[]> = {
  sugar: [
    'สั่งเครื่องดื่ม “หวานน้อย/ไม่หวาน” — ชาเย็น 1 แก้วมีน้ำตาลราว 8–11 ช้อนชา เกินทั้งวันแล้ว',
    'เปลี่ยนน้ำอัดลม/ชาเขียวขวดเป็นสูตรไม่มีน้ำตาล หรือน้ำเปล่า โซดา',
    'กินผลไม้สดแทนน้ำผลไม้และขนมหวาน',
  ],
  fat: [
    'เลือก ต้ม นึ่ง ย่าง ยำ แทน ทอด ผัดน้ำมันเยอะ และแกงกะทิ',
    'หมูกรอบ ขาหมู หนังไก่ คอหมู มีไขมันสูง — เลือกอกไก่ หมูเนื้อแดง ปลา',
    'ขอ “น้ำมันน้อย” เวลาสั่งอาหารตามสั่ง',
  ],
  sodium: [
    'ไม่ซดน้ำซุปก๋วยเตี๋ยว/ต้มยำจนหมด และชิมก่อนปรุงเพิ่ม',
    'ลดน้ำจิ้ม น้ำปลาพริก ซอส — น้ำปลา 1 ช้อนโต๊ะ ≈ 1,200–1,500 มก.',
    'บะหมี่กึ่งสำเร็จรูป อาหารแช่แข็ง ไส้กรอก ปลาร้า มีโซเดียมสูง ใส่เครื่องปรุงแค่ครึ่งซอง',
  ],
  protein: [
    'ให้มีโปรตีนทุกมื้อ ~20–30 g เช่น อกไก่ 100 g (31 g), ไข่ 2 ฟอง (13 g), ปลา, เต้าหู้',
    'มื้อเช้าเพิ่มไข่ต้ม นมจืด หรือน้ำเต้าหู้ไม่หวาน',
    'ของว่างเลือกโยเกิร์ตรสธรรมชาติ นม หรืออกไก่ แทนขนม',
  ],
}
