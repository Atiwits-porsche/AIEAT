import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BodyScan, type Profile, type Sex } from './db'
import { ageOf, type MeasuredBmr } from './calc'

export type Tone = 'low' | 'good' | 'warn' | 'bad' | 'neutral'
export interface Zone { to: number; label: string; tone: Tone }
export interface Scale { min: number; max: number; zones: Zone[] }

export const zoneOf = (scale: Scale, v: number) => scale.zones.find((z) => v < z.to) ?? scale.zones[scale.zones.length - 1]

/** เกณฑ์ %ไขมัน ตามเพศ/อายุ (อ้างอิง Gallagher et al. 2000 ที่เครื่อง Tanita ใช้) */
export function fatRange(sex: Sex, age: number) {
  const t = sex === 'male'
    ? age < 40 ? [8, 20, 25] : age < 60 ? [11, 22, 28] : [13, 25, 30]
    : age < 40 ? [21, 33, 39] : age < 60 ? [23, 34, 40] : [24, 36, 42]
  return { low: t[0], high: t[1], over: t[2] }
}

export function fatScale(sex: Sex, age: number): Scale {
  const r = fatRange(sex, age)
  return {
    min: Math.max(0, r.low - 8),
    max: r.over + 15,
    zones: [
      { to: r.low, label: 'ต่ำ', tone: 'low' },
      { to: r.high, label: 'เหมาะสม', tone: 'good' },
      { to: r.over, label: 'เกิน', tone: 'warn' },
      { to: Infinity, label: 'สูงมาก', tone: 'bad' },
    ],
  }
}

/** ไขมันช่องท้อง: 1–12 ปกติ, 13–17 เริ่มเสี่ยง, 18+ เสี่ยงสูง */
export const visceralScale: Scale = {
  min: 1,
  max: 25,
  zones: [
    { to: 12.5, label: 'ปกติ', tone: 'good' },
    { to: 17.5, label: 'เริ่มเสี่ยง', tone: 'warn' },
    { to: Infinity, label: 'เสี่ยงสูง', tone: 'bad' },
  ],
}

/** BMI เกณฑ์คนเอเชีย */
export const bmiScale: Scale = {
  min: 15,
  max: 40,
  zones: [
    { to: 18.5, label: 'น้อย', tone: 'low' },
    { to: 23, label: 'ปกติ', tone: 'good' },
    { to: 25, label: 'ท้วม', tone: 'warn' },
    { to: 30, label: 'อ้วน', tone: 'bad' },
    { to: Infinity, label: 'อ้วนมาก', tone: 'bad' },
  ],
}

/** %น้ำในร่างกาย: ชาย 50–65, หญิง 45–60 */
export function tbwScale(sex: Sex): Scale {
  const [lo, hi] = sex === 'male' ? [50, 65] : [45, 60]
  return {
    min: 30,
    max: 75,
    zones: [
      { to: lo, label: 'ต่ำกว่าเกณฑ์', tone: 'warn' },
      { to: hi, label: 'เหมาะสม', tone: 'good' },
      { to: Infinity, label: 'สูง', tone: 'neutral' },
    ],
  }
}

/** ECW/TBW: ไม่ตัดสินดี/ไม่ดี (แต่ละยี่ห้อวัดต่างกัน) ใช้ดูแนวโน้ม */
export const ecwScale: Scale = { min: 35, max: 48, zones: [{ to: Infinity, label: 'ใช้ดูแนวโน้ม', tone: 'neutral' }] }

/** เติมค่าที่คำนวณได้ถ้าไม่ได้กรอก */
export function derive(s: BodyScan, heightCm?: number) {
  const fatMass = s.fatMass ?? (s.weight * s.fatPct) / 100
  const ffm = s.ffm ?? s.weight - fatMass
  const bmi = s.bmi ?? (heightCm ? s.weight / (heightCm / 100) ** 2 : undefined)
  const tbwPct = s.tbwPct ?? (s.tbwKg ? (s.tbwKg / s.weight) * 100 : undefined)
  const ecwTbwPct = s.ecwTbwPct ?? (s.ecwKg && s.icwKg ? (s.ecwKg / (s.ecwKg + s.icwKg)) * 100 : undefined)
  return { ...s, fatMass, ffm, bmi, tbwPct, ecwTbwPct }
}
export type Derived = ReturnType<typeof derive>

/** น้ำหนักที่ทำให้ %ไขมันเท่ากับ target โดยรักษามวลไร้ไขมันไว้เท่าเดิม */
export const weightAtFatPct = (ffm: number, pct: number) => ffm / (1 - pct / 100)

export function goals(d: Derived, profile: Profile) {
  const age = ageOf(profile.birthYear)
  const r = fatRange(profile.sex, age)
  const healthyWeight = weightAtFatPct(d.ffm, r.high)
  const fatToLose = Math.max(0, d.weight - healthyWeight)
  const atGoalFatPct = ((profile.goalWeight - d.ffm) / profile.goalWeight) * 100
  return {
    range: r,
    healthyWeight,
    fatToLose,
    goalWeight: profile.goalWeight,
    atGoalFatPct,
    goalTooLow: profile.goalWeight <= d.ffm * 1.03 || atGoalFatPct < r.low,
    proteinLo: Math.round(d.ffm * 1.6),
    proteinHi: Math.round(d.ffm * 2.2),
  }
}

export interface Note { icon: string; text: string; tone: 'good' | 'warn' | 'info' }

export function bodyInsights(d: Derived, prev: Derived | undefined, profile: Profile): Note[] {
  const out: Note[] = []
  const age = ageOf(profile.birthYear)
  const r = fatRange(profile.sex, age)

  if (d.visceralFat !== undefined) {
    if (d.visceralFat >= 18) out.push({ icon: '🚨', tone: 'warn', text: `ไขมันช่องท้องระดับ ${d.visceralFat} อยู่ในเกณฑ์เสี่ยงสูง (ปกติ ≤ 12) สัมพันธ์กับเบาหวาน/ความดัน/ไขมันพอกตับ ควรปรึกษาแพทย์และตรวจเลือดประจำปี` })
    else if (d.visceralFat >= 13) out.push({ icon: '⚠️', tone: 'warn', text: `ไขมันช่องท้องระดับ ${d.visceralFat} เริ่มเสี่ยง (ปกติ ≤ 12) ต้องลดอีก ${d.visceralFat - 12} ระดับ — ไขมันช่องท้องลดได้เร็วเมื่อคุมแคล ลดน้ำตาล/แอลกอฮอล์ และเดินเร็ว/คาร์ดิโอ 150 นาทีต่อสัปดาห์` })
    else out.push({ icon: '✅', tone: 'good', text: `ไขมันช่องท้องระดับ ${d.visceralFat} อยู่ในเกณฑ์ปกติ` })
  }

  if (d.fatPct > r.high) {
    out.push({ icon: '🎯', tone: 'info', text: `%ไขมัน ${d.fatPct.toFixed(1)}% สูงกว่าเกณฑ์เหมาะสม (${r.low}–${r.high}%) ต้องลดไขมันราว ${(d.weight - weightAtFatPct(d.ffm, r.high)).toFixed(1)} กก. ถ้ารักษากล้ามเนื้อไว้ได้` })
  } else if (d.fatPct >= r.low) {
    out.push({ icon: '✅', tone: 'good', text: `%ไขมัน ${d.fatPct.toFixed(1)}% อยู่ในเกณฑ์เหมาะสมแล้ว เน้นรักษากล้ามเนื้อต่อ` })
  }

  if (d.metabolicAge !== undefined) {
    const diff = d.metabolicAge - age
    if (diff > 0) out.push({ icon: '⏳', tone: 'warn', text: `อายุเมตาบอลิซึม ${d.metabolicAge} ปี มากกว่าอายุจริง ${diff} ปี — การเพิ่มกล้ามเนื้อและลดไขมันจะช่วยให้ตัวเลขนี้ลดลง` })
    else out.push({ icon: '💪', tone: 'good', text: `อายุเมตาบอลิซึม ${d.metabolicAge} ปี ${diff === 0 ? 'เท่ากับ' : `น้อยกว่าอายุจริง ${-diff} ปี`}` })
  }

  if (d.tbwPct !== undefined) {
    const lo = profile.sex === 'male' ? 50 : 45
    if (d.tbwPct < lo) out.push({ icon: '💧', tone: 'info', text: `น้ำในร่างกาย ${d.tbwPct.toFixed(1)}% ต่ำกว่าเกณฑ์ (${lo}%+) ส่วนใหญ่เป็นเพราะไขมันสูง (ไขมันมีน้ำน้อยกว่ากล้ามเนื้อ) จะดีขึ้นเองเมื่อไขมันลด ดื่มน้ำให้พอวันละ ~${Math.round(d.weight * 0.033 * 10) / 10} ลิตร` })
  }

  if (prev) {
    const dw = d.weight - prev.weight
    const df = d.fatMass - prev.fatMass
    const dl = d.ffm - prev.ffm
    if (dw < -0.3) {
      const fatShare = dw !== 0 ? (df / dw) * 100 : 0
      out.push({
        icon: fatShare >= 70 ? '🏆' : '📉',
        tone: fatShare >= 70 ? 'good' : 'warn',
        text: `เทียบครั้งก่อน น้ำหนักลด ${(-dw).toFixed(1)} กก. เป็นไขมัน ${(-df).toFixed(1)} กก. และมวลไร้ไขมัน ${(-dl).toFixed(1)} กก.` +
          (fatShare >= 70 ? ' — ลดเป็นไขมันเป็นหลัก ดีมาก' : ' — เสียมวลไร้ไขมันมาก ควรเพิ่มโปรตีนและเวทเทรนนิ่ง'),
      })
    }
    if (d.muscleMass !== undefined && prev.muscleMass !== undefined && d.muscleMass - prev.muscleMass <= -0.5) {
      out.push({ icon: '🏋️', tone: 'warn', text: `มวลกล้ามเนื้อลดลง ${(prev.muscleMass - d.muscleMass).toFixed(1)} กก. จากครั้งก่อน ควรกินโปรตีนให้ถึงเป้าและเล่นเวท 2–3 ครั้ง/สัปดาห์` })
    }
  }
  return out
}

/** BMR จากผลวัดล่าสุด ถ้าผู้ใช้เลือกให้ใช้ */
export function useMeasuredBmr(profile?: Profile | null): MeasuredBmr | undefined {
  const latest = useLiveQuery(
    () => db.bodyScans.orderBy('date').reverse().filter((s) => !!s.bmrKcal).first(),
    [],
  )
  if (!profile?.useScanBmr || !latest?.bmrKcal) return undefined
  return { kcal: latest.bmrKcal, weight: latest.weight }
}
