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
}

export interface WeightLog {
  date: string // YYYY-MM-DD
  morningKg?: number
  eveningKg?: number
}

export interface MealEntry {
  id?: number
  date: string
  meal: Meal
  name: string
  unit: string
  kcalPerUnit: number
  qty: number
  createdAt: number
}

export interface CustomFood {
  id?: number
  name: string
  kcal: number
  unit: string
}

class AieatDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>
  weights!: EntityTable<WeightLog, 'date'>
  entries!: EntityTable<MealEntry, 'id'>
  customFoods!: EntityTable<CustomFood, 'id'>

  constructor() {
    super('aieat')
    this.version(1).stores({
      profile: 'id',
      weights: 'date',
      entries: '++id, date, createdAt',
      customFoods: '++id, name',
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
  const [profile, weights, entries, customFoods] = await Promise.all([
    db.profile.toArray(),
    db.weights.toArray(),
    db.entries.toArray(),
    db.customFoods.toArray(),
  ])
  return { app: 'aieat', version: 1, exportedAt: new Date().toISOString(), profile, weights, entries, customFoods }
}

export async function importAll(data: unknown) {
  const d = data as Partial<Awaited<ReturnType<typeof exportAll>>>
  if (!d || d.app !== 'aieat') throw new Error('ไฟล์นี้ไม่ใช่ข้อมูลของ AIEAT')
  await db.transaction('rw', [db.profile, db.weights, db.entries, db.customFoods], async () => {
    await Promise.all([db.profile.clear(), db.weights.clear(), db.entries.clear(), db.customFoods.clear()])
    await db.profile.bulkPut(d.profile ?? [])
    await db.weights.bulkPut(d.weights ?? [])
    await db.entries.bulkPut(d.entries ?? [])
    await db.customFoods.bulkPut(d.customFoods ?? [])
  })
}
