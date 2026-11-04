import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ActivityLog, type Profile } from './db'
import { addDays } from './date'

export type ActCat = 'cardio' | 'strength' | 'flex' | 'sport' | 'daily'

export interface ActType { key: string; name: string; icon: string; met: number; cat: ActCat }

/** ค่า MET จาก Compendium of Physical Activities (ค่ากลางของแต่ละกิจกรรม) */
export const ACTIVITY_TYPES: ActType[] = [
  { key: 'walk', name: 'เดิน', icon: '🚶', met: 3.5, cat: 'cardio' },
  { key: 'brisk', name: 'เดินเร็ว', icon: '🚶‍♂️', met: 4.3, cat: 'cardio' },
  { key: 'jog', name: 'วิ่งเหยาะ', icon: '🏃', met: 7, cat: 'cardio' },
  { key: 'run', name: 'วิ่ง (~10 กม./ชม.)', icon: '🏃‍♂️', met: 9.8, cat: 'cardio' },
  { key: 'bike', name: 'ปั่นจักรยาน', icon: '🚴', met: 6.8, cat: 'cardio' },
  { key: 'spin', name: 'ปั่นจักรยานอยู่กับที่', icon: '🚲', met: 6.8, cat: 'cardio' },
  { key: 'elliptical', name: 'เครื่องเดินวงรี', icon: '⚙️', met: 5, cat: 'cardio' },
  { key: 'swim', name: 'ว่ายน้ำ', icon: '🏊', met: 6, cat: 'cardio' },
  { key: 'hiit', name: 'HIIT / เซอร์กิต', icon: '🔥', met: 8, cat: 'cardio' },
  { key: 'aerobic', name: 'แอโรบิก / เต้น', icon: '💃', met: 6.5, cat: 'cardio' },
  { key: 'rope', name: 'กระโดดเชือก', icon: '➰', met: 11, cat: 'cardio' },
  { key: 'stairs', name: 'เดินขึ้นบันได', icon: '🪜', met: 8, cat: 'cardio' },
  { key: 'hike', name: 'เดินป่า / ขึ้นเขา', icon: '🥾', met: 6, cat: 'cardio' },
  { key: 'weights', name: 'เวทเทรนนิ่ง', icon: '🏋️', met: 5, cat: 'strength' },
  { key: 'bodyweight', name: 'บอดี้เวท (วิดพื้น/สควอท)', icon: '🤸', met: 3.8, cat: 'strength' },
  { key: 'yoga', name: 'โยคะ', icon: '🧘', met: 2.5, cat: 'flex' },
  { key: 'pilates', name: 'พิลาทิส', icon: '🧘‍♀️', met: 3, cat: 'flex' },
  { key: 'stretch', name: 'ยืดเหยียด', icon: '🙆', met: 2.3, cat: 'flex' },
  { key: 'badminton', name: 'แบดมินตัน', icon: '🏸', met: 5.5, cat: 'sport' },
  { key: 'football', name: 'ฟุตบอล', icon: '⚽', met: 7, cat: 'sport' },
  { key: 'basketball', name: 'บาสเกตบอล', icon: '🏀', met: 6.5, cat: 'sport' },
  { key: 'tennis', name: 'เทนนิส', icon: '🎾', met: 7.3, cat: 'sport' },
  { key: 'boxing', name: 'มวยไทย / ชกมวย', icon: '🥊', met: 7.8, cat: 'sport' },
  { key: 'golf', name: 'กอล์ฟ (เดิน)', icon: '⛳', met: 4.8, cat: 'sport' },
  { key: 'house', name: 'ทำงานบ้าน', icon: '🧹', met: 3, cat: 'daily' },
  { key: 'garden', name: 'ทำสวน', icon: '🌱', met: 3.8, cat: 'daily' },
]

export const CAT_LABEL: Record<ActCat, string> = {
  cardio: 'คาร์ดิโอ', strength: 'เวท/สร้างกล้าม', flex: 'ยืดหยุ่น', sport: 'กีฬา', daily: 'กิจวัตร',
}

/** kcal = MET × 3.5 × น้ำหนัก(กก.) ÷ 200 × นาที */
export const estimateKcal = (met: number, weightKg: number, minutes: number) => Math.round((met * 3.5 * weightKg / 200) * minutes)

export type Level = 'beginner' | 'intermediate' | 'advanced'
export interface PlanDay { cat: ActCat | 'rest'; label: string; minutes: number }

export const LEVELS: { key: Level; label: string; desc: string }[] = [
  { key: 'beginner', label: 'เริ่มต้น', desc: 'เพิ่งเริ่ม / ไม่ได้ออกกำลังกายมานาน' },
  { key: 'intermediate', label: 'ปานกลาง', desc: 'ออกกำลังกายสม่ำเสมอ 2–3 ครั้ง/สัปดาห์' },
  { key: 'advanced', label: 'เข้มข้น', desc: 'ออกกำลังกายเป็นประจำ 4+ ครั้ง/สัปดาห์' },
]

/** แผนรายสัปดาห์ (จันทร์–อาทิตย์) ตามคำแนะนำ WHO: คาร์ดิโอ 150–300 นาที + เวท ≥ 2 วัน/สัปดาห์ */
export const WEEK_PLANS: Record<Level, PlanDay[]> = {
  beginner: [
    { cat: 'cardio', label: 'เดินเร็ว', minutes: 30 },
    { cat: 'strength', label: 'บอดี้เวททั้งตัว', minutes: 25 },
    { cat: 'cardio', label: 'เดินเร็ว / ปั่นจักรยาน', minutes: 30 },
    { cat: 'strength', label: 'บอดี้เวททั้งตัว', minutes: 25 },
    { cat: 'cardio', label: 'เดินเร็ว', minutes: 30 },
    { cat: 'cardio', label: 'ปั่นจักรยาน / ว่ายน้ำ / กีฬา', minutes: 45 },
    { cat: 'rest', label: 'พัก / ยืดเหยียดเบาๆ', minutes: 0 },
  ],
  intermediate: [
    { cat: 'cardio', label: 'วิ่งเหยาะ / ปั่นจักรยาน', minutes: 40 },
    { cat: 'strength', label: 'เวทช่วงบน', minutes: 45 },
    { cat: 'cardio', label: 'HIIT', minutes: 20 },
    { cat: 'strength', label: 'เวทช่วงล่าง', minutes: 45 },
    { cat: 'cardio', label: 'วิ่งเหยาะ / ว่ายน้ำ', minutes: 40 },
    { cat: 'cardio', label: 'กีฬา / เดินป่า', minutes: 60 },
    { cat: 'flex', label: 'โยคะ / ยืดเหยียด', minutes: 20 },
  ],
  advanced: [
    { cat: 'strength', label: 'เวทช่วงบน (Push)', minutes: 60 },
    { cat: 'cardio', label: 'วิ่ง / ปั่นจักรยาน', minutes: 45 },
    { cat: 'strength', label: 'เวทช่วงล่าง (Legs)', minutes: 60 },
    { cat: 'cardio', label: 'HIIT', minutes: 25 },
    { cat: 'strength', label: 'เวทช่วงบน (Pull)', minutes: 60 },
    { cat: 'cardio', label: 'คาร์ดิโอยาว / กีฬา', minutes: 60 },
    { cat: 'flex', label: 'โยคะ / ยืดเหยียด / พัก', minutes: 30 },
  ],
}

export const DOW = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์', 'อาทิตย์']

export const typeOf = (key: string) => ACTIVITY_TYPES.find((t) => t.key === key)

/** แคลที่เผาผลาญรายวัน (เฉพาะเมื่อเปิดให้นับเพิ่มในงบ) */
export function useExerciseBonus(profile?: Profile | null) {
  const acts = useLiveQuery(() => (profile?.addExercise ? db.activities.toArray() : Promise.resolve([] as ActivityLog[])), [profile?.addExercise])
  const m = new Map<string, number>()
  for (const a of acts ?? []) m.set(a.date, (m.get(a.date) ?? 0) + a.kcal)
  return m
}

export function weekDates(weekStartDate: string) {
  return [...Array(7).keys()].map((i) => addDays(weekStartDate, i))
}
