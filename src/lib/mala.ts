// หม่าล่าตัก: คำนวณจากน้ำหนักที่ตัก (ตามบิล) + สัดส่วนเนื้อ/ผัก/แป้ง
//
// ค่าต่อ 100g ของ "ของที่ตัก" ก่อนลวก (ร้านส่วนใหญ่ชั่งตอนนี้) ยังไม่รวมน้ำมันหม่าล่าที่ซึมเข้าไป:
// - เนื้อสัตว์/ลูกชิ้น: เฉลี่ยหมูสไลด์ เนื้อ ไก่ ลูกชิ้น ไส้กรอก เต้าหู้ปลา
// - ผัก/เห็ด: ผักใบ เห็ด ข้าวโพดอ่อน บรอกโคลี
// - แป้ง/เส้น: เส้นสด วุ้นเส้นแช่น้ำ บะหมี่ มันฝรั่ง หมั่นโถว ต๊อก
// น้ำมันที่ซึมเข้าไปคิดแยกตามระดับ (ต่อ 100g ของที่ตัก) เพราะเป็นส่วนที่ทำให้แคลต่างกันมากที่สุด
import type { Nutrients } from './nutrition'

export type MalaPart = 'meat' | 'veg' | 'starch'
export type MalaOil = 'low' | 'normal' | 'high'

export const MALA_PARTS: { key: MalaPart; label: string; short: string; icon: string }[] = [
  { key: 'meat', label: 'เนื้อสัตว์/ลูกชิ้น', short: 'เนื้อ', icon: '🥩' },
  { key: 'veg', label: 'ผัก/เห็ด', short: 'ผัก', icon: '🥬' },
  { key: 'starch', label: 'แป้ง/เส้น', short: 'แป้ง', icon: '🍜' },
]

const BASE: Record<MalaPart, { kcal: number; n: Nutrients }> = {
  meat: { kcal: 175, n: { protein: 14, fat: 12.5, sugar: 1, sodium: 600 } },
  veg: { kcal: 25, n: { protein: 2, fat: 0.3, sugar: 0.5, sodium: 300 } },
  starch: { kcal: 150, n: { protein: 3, fat: 1, sugar: 0.5, sodium: 300 } },
}

export const MALA_OIL: Record<MalaOil, { label: string; fat: number; sodium: number }> = {
  low: { label: 'น้อย/ซุปใส', fat: 2, sodium: 200 },
  normal: { label: 'ปกติ', fat: 4, sodium: 300 },
  high: { label: 'เยอะ/เผ็ดมาก', fat: 7, sodium: 400 },
}

const SOUP_CUP = { kcal: 150, n: { protein: 1, fat: 15, sugar: 1, sodium: 1200 } } // น้ำซุปหม่าล่า 1 ถ้วย
const SESAME = { kcal: 130, n: { protein: 3, fat: 11, sugar: 3, sodium: 300 } } // น้ำจิ้มงา 1 ถ้วยเล็ก (~30g)

export interface MalaInput {
  grams: number
  pct: Record<MalaPart, number>
  oil: MalaOil
  /** น้ำซุปที่ดื่ม (ถ้วย) */
  soup: number
  /** น้ำจิ้มงา (ถ้วยเล็ก) */
  sesame: number
}

export const MALA_DEFAULT: MalaInput = { grams: 300, pct: { meat: 40, veg: 40, starch: 20 }, oil: 'normal', soup: 0, sesame: 0 }

export const MALA_PRESETS: { label: string; pct: Record<MalaPart, number> }[] = [
  { label: 'สมดุล', pct: { meat: 40, veg: 40, starch: 20 } },
  { label: 'ผักเยอะ', pct: { meat: 25, veg: 60, starch: 15 } },
  { label: 'เนื้อเยอะ', pct: { meat: 60, veg: 25, starch: 15 } },
  { label: 'แป้งเยอะ', pct: { meat: 25, veg: 30, starch: 45 } },
]

export function malaCalc(i: MalaInput): { kcal: number; n: Nutrients; parts: Record<MalaPart, number> } {
  const n: Nutrients = { protein: 0, fat: 0, sugar: 0, sodium: 0 }
  let kcal = 0
  const parts = { meat: 0, veg: 0, starch: 0 }
  for (const { key } of MALA_PARTS) {
    const g = (i.grams * i.pct[key]) / 100
    parts[key] = Math.round(g)
    const b = BASE[key]
    kcal += (b.kcal * g) / 100
    for (const k of Object.keys(n) as (keyof Nutrients)[]) n[k] += (b.n[k] * g) / 100
  }
  const oil = MALA_OIL[i.oil]
  const oilFat = (oil.fat * i.grams) / 100
  kcal += oilFat * 9
  n.fat += oilFat
  n.sodium += (oil.sodium * i.grams) / 100
  for (const [x, qty] of [[SOUP_CUP, i.soup], [SESAME, i.sesame]] as const) {
    kcal += x.kcal * qty
    for (const k of Object.keys(n) as (keyof Nutrients)[]) n[k] += x.n[k] * qty
  }
  return {
    kcal: Math.round(kcal),
    n: { protein: Math.round(n.protein), fat: Math.round(n.fat), sugar: Math.round(n.sugar), sodium: Math.round(n.sodium / 10) * 10 },
    parts,
  }
}

/** ชื่อรายการที่บันทึก — มีน้ำหนักและสัดส่วนในชื่อ เพื่อให้ดูย้อนหลังรู้ว่ากินอะไร (และใช้นับผักได้) */
export function malaName(i: MalaInput): string {
  const pct = MALA_PARTS.map((p) => `${p.short} ${i.pct[p.key]}%`).join(' · ')
  let s = `หม่าล่าตัก ${Math.round(i.grams)}g (${pct})`
  if (i.oil !== 'normal') s += ` น้ำมัน${MALA_OIL[i.oil].label}`
  if (i.soup) s += i.soup === 0.5 ? ' + ซุปครึ่งถ้วย' : ` + ซุป ${i.soup} ถ้วย`
  if (i.sesame) s += ` + น้ำจิ้มงา ${i.sesame}`
  return s
}

/** จำนวนส่วนผักจากชื่อรายการหม่าล่าตักที่คำนวณ (ผัก 80g = 1 ส่วน) */
export function malaVegServings(name: string): number | undefined {
  const m = /^หม่าล่าตัก (\d+)g \(.*ผัก (\d+)%/.exec(name)
  if (!m) return
  return Math.round(((Number(m[1]) * Number(m[2])) / 100 / 80) * 10) / 10
}

/** อ่านค่าที่เคยกรอกกลับจากชื่อรายการ (ใช้ตอนเปิดเครื่องคิดจากเมนูล่าสุด) */
export function malaParse(name: string): MalaInput | undefined {
  const m = /^หม่าล่าตัก (\d+)g \(เนื้อ (\d+)% · ผัก (\d+)% · แป้ง (\d+)%\)(.*)$/.exec(name)
  if (!m) return
  const rest = m[5]
  const oil = (Object.keys(MALA_OIL) as MalaOil[]).find((k) => rest.includes(`น้ำมัน${MALA_OIL[k].label}`)) ?? 'normal'
  const soupM = /ซุป(ครึ่ง| \d+(?:\.\d+)?) ?ถ้วย/.exec(rest)
  const sesM = /น้ำจิ้มงา (\d+)/.exec(rest)
  return {
    grams: Number(m[1]),
    pct: { meat: Number(m[2]), veg: Number(m[3]), starch: Number(m[4]) },
    oil,
    soup: soupM ? (soupM[1] === 'ครึ่ง' ? 0.5 : Number(soupM[1].trim())) : 0,
    sesame: sesM ? Number(sesM[1]) : 0,
  }
}

/** ปรับสัดส่วนส่วนหนึ่ง แล้วแบ่งที่เหลือให้อีก 2 ส่วนตามสัดส่วนเดิม (รวมเป็น 100 เสมอ ขั้นละ 5%) */
export function rebalance(p: Record<MalaPart, number>, key: MalaPart, value: number): Record<MalaPart, number> {
  const v = Math.max(0, Math.min(100, Math.round(value / 5) * 5))
  const [a, b] = MALA_PARTS.map((x) => x.key).filter((k) => k !== key)
  const rest = 100 - v
  const sum = p[a] + p[b]
  const va = Math.min(rest, Math.round((sum ? (rest * p[a]) / sum : rest / 2) / 5) * 5)
  return { ...p, [key]: v, [a]: va, [b]: rest - va } as Record<MalaPart, number>
}
