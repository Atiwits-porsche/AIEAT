import Dexie, { type EntityTable } from 'dexie'

export type Sex = 'male' | 'female'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Profile {
  id: 'me'
  sex: Sex
  birthYear: number // ค.ศ.
  heightCm: number
  startWeight: number
  goalWeight: number
  activity: Activity
  ratePerWeek: number // กก./สัปดาห์
  createdAt: string
  /** ใช้ BMR จากเครื่องวัดองค์ประกอบร่างกายแทนสูตร */
  useScanBmr?: boolean
  /** แผนลดน้ำหนัก: เริ่มวันไหน น้ำหนักเท่าไหร่ ภายในกี่เดือน */
  planStartDate?: string
  planStartWeight?: number
  planMonths?: number
  /** นับแคลที่เผาผลาญจากการออกกำลังกายเพิ่มในงบแคลของวันนั้น */
  addExercise?: boolean
  exerciseLevel?: 'beginner' | 'intermediate' | 'advanced'
}

export interface WeightLog {
  date: string // YYYY-MM-DD
  morningKg?: number
  eveningKg?: number
}

export interface MealEntry {
  id?: number
  /** id ถาวรสำหรับซิงก์ข้ามเครื่อง */
  uid?: string
  date: string
  meal: Meal
  name: string
  unit: string
  kcalPerUnit: number
  qty: number
  createdAt: number
}

/** ผลวัดจากเครื่องวัดองค์ประกอบร่างกาย (เช่น Tanita, InBody) */
export interface BodyScan {
  id?: number
  /** id ถาวรสำหรับซิงก์ข้ามเครื่อง */
  uid?: string
  date: string
  device?: string
  weight: number
  fatPct: number
  fatMass?: number // กก.
  ffm?: number // มวลไร้ไขมัน กก.
  muscleMass?: number // กก.
  bmi?: number
  metabolicAge?: number
  bmrKcal?: number
  visceralFat?: number // ระดับ
  tbwKg?: number
  tbwPct?: number
  ecwKg?: number
  icwKg?: number
  ecwTbwPct?: number
  note?: string
}

export interface ActivityLog {
  id?: number
  /** id ถาวรสำหรับซิงก์ข้ามเครื่อง */
  uid?: string
  date: string
  type: string // key ใน ACTIVITY_TYPES
  name: string
  minutes: number
  kcal: number
  createdAt: number
}

export interface CustomFood {
  id?: number
  /** id ถาวรสำหรับซิงก์ข้ามเครื่อง */
  uid?: string
  name: string
  kcal: number
  unit: string
}

/** รายการที่รอส่งขึ้นคลาวด์ */
export interface SyncItem {
  id: string // `${kind}:${key}`
  kind: string
  key: string
  deleted: boolean
  at: number
}

export const newUid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`

class AieatDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>
  weights!: EntityTable<WeightLog, 'date'>
  entries!: EntityTable<MealEntry, 'id'>
  customFoods!: EntityTable<CustomFood, 'id'>
  bodyScans!: EntityTable<BodyScan, 'id'>
  activities!: EntityTable<ActivityLog, 'id'>
  syncQueue!: EntityTable<SyncItem, 'id'>

  constructor() {
    super('aieat')
    this.version(1).stores({
      profile: 'id',
      weights: 'date',
      entries: '++id, date, createdAt',
      customFoods: '++id, name',
    })
    this.version(2).stores({ bodyScans: '++id, date' })
    this.version(3).stores({ activities: '++id, date, createdAt' })
    // v4: เพิ่ม uid ให้ทุกรายการ (ใช้ซิงก์ข้ามเครื่อง) + คิวรอส่งขึ้นคลาวด์
    this.version(4)
      .stores({
        entries: '++id, date, createdAt, uid',
        customFoods: '++id, name, uid',
        bodyScans: '++id, date, uid',
        activities: '++id, date, createdAt, uid',
        syncQueue: 'id',
      })
      .upgrade(async (tx) => {
        for (const t of ['entries', 'customFoods', 'bodyScans', 'activities']) {
          await tx.table(t).toCollection().modify((o: { uid?: string }) => {
            if (!o.uid) o.uid = newUid()
          })
        }
      })
  }
}

export const db = new AieatDB()

export const MEALS: { key: Meal; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'มื้อเช้า', icon: '🌅' },
  { key: 'lunch', label: 'มื้อกลางวัน', icon: '☀️' },
  { key: 'dinner', label: 'มื้อเย็น', icon: '🌙' },
  { key: 'snack', label: 'ของกินระหว่างวัน', icon: '🍪' },
]

export async function exportAll() {
  const [profile, weights, entries, customFoods, bodyScans, activities] = await Promise.all([
    db.profile.toArray(),
    db.weights.toArray(),
    db.entries.toArray(),
    db.customFoods.toArray(),
    db.bodyScans.toArray(),
    db.activities.toArray(),
  ])
  return { app: 'aieat', version: 3, exportedAt: new Date().toISOString(), profile, weights, entries, customFoods, bodyScans, activities }
}

export async function importAll(data: unknown) {
  const d = data as Partial<Awaited<ReturnType<typeof exportAll>>>
  if (!d || d.app !== 'aieat') throw new Error('ไฟล์นี้ไม่ใช่ข้อมูลของ AIEAT')
  await db.transaction('rw', [db.profile, db.weights, db.entries, db.customFoods, db.bodyScans, db.activities], async () => {
    // ใช้ collection.delete() (ไม่ใช่ clear) เพื่อให้การลบถูกซิงก์ไปเครื่องอื่นด้วย
    for (const t of [db.profile, db.weights, db.entries, db.customFoods, db.bodyScans, db.activities]) await t.toCollection().delete()
    await db.profile.bulkPut(d.profile ?? [])
    await db.weights.bulkPut(d.weights ?? [])
    await db.entries.bulkPut(d.entries ?? [])
    await db.customFoods.bulkPut(d.customFoods ?? [])
    await db.bodyScans.bulkPut(d.bodyScans ?? [])
    await db.activities.bulkPut(d.activities ?? [])
  })
}
