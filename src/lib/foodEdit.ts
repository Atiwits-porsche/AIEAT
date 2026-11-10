// แก้แคลและสารอาหารของเมนู ทั้งเมนูในฐานข้อมูลและเมนูของฉัน
// ค่าที่แก้ของเมนูในฐานข้อมูลเก็บเป็น customFoods ที่ชื่อ+หน่วยตรงกัน (จึงซิงก์ข้ามเครื่องได้เหมือนเมนูของฉัน)
import { db, type CustomFood } from './db'
import { builtinExact } from './foods'
import type { Nutrients } from './nutrition'

export const NUT_FIELDS: (keyof Nutrients)[] = ['protein', 'fat', 'sugar', 'sodium']

const sameN = (a?: Nutrients, b?: Nutrients) =>
  !a || !b ? !a && !b : NUT_FIELDS.every((k) => Math.abs(a[k] - b[k]) < 1e-9)

export async function findCustom(name: string, unit: string): Promise<CustomFood | undefined> {
  return (await db.customFoods.where('name').equals(name).toArray()).find((c) => c.unit === unit)
}

const sameItem = (name: string, unit: string) => (e: { name: string; unit: string }) => e.name === name && e.unit === unit

export const countLogged = (name: string, unit: string) => db.entries.filter(sameItem(name, unit)).count()

/**
 * บันทึกแคล/สารอาหารต่อ 1 หน่วยของเมนู
 * - เมนูในฐานข้อมูล: ถ้าค่าเท่ากับค่าเดิมพอดี จะลบค่าที่แก้ทิ้ง (= คืนค่าเดิม)
 * - updatePast: ปรับรายการที่บันทึกไปแล้วที่ชื่อ+หน่วยเดียวกันด้วย
 * คืนจำนวนรายการเก่าที่ถูกปรับ
 */
export async function saveFood(name: string, unit: string, kcal: number, n: Nutrients | undefined, updatePast: boolean) {
  const base = builtinExact(name, unit)
  return db.transaction('rw', db.customFoods, db.entries, async () => {
    const cur = await findCustom(name, unit)
    if (base && base.kcal === kcal && sameN(base.n, n)) {
      if (cur) await db.customFoods.delete(cur.id!)
    } else if (cur) {
      await db.customFoods.update(cur.id!, { kcal, n })
    } else {
      await db.customFoods.add({ name, unit, kcal, ...(n ? { n } : {}) })
    }
    if (!updatePast) return 0
    return db.entries.filter(sameItem(name, unit)).modify((e) => {
      e.kcalPerUnit = kcal
      if (n) e.n = n
      else delete e.n
    })
  })
}
