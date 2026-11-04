import { useEffect, useRef, useState } from 'react'
import { todayStr } from './date'

/** วันที่ปัจจุบันที่อัปเดตเองเมื่อข้ามเที่ยงคืน หรือเมื่อกลับมาเปิดแอปจากพื้นหลัง */
export function useToday() {
  const [today, setToday] = useState(todayStr())
  useEffect(() => {
    const check = () => setToday(todayStr())
    const iv = window.setInterval(check, 60_000)
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
    }
  }, [])
  return today
}

/**
 * state ที่ "ตาม" วันนี้: ถ้าผู้ใช้กำลังดูค่าที่ได้จากวันนี้อยู่ (เช่น หน้าวันนี้ / สัปดาห์นี้)
 * เมื่อข้ามวันจะขยับตามให้อัตโนมัติ แต่ถ้ากำลังดูวันอื่นอยู่จะไม่ไปยุ่ง
 */
export function useFollowToday<T>(today: string, fromToday: (t: string) => T) {
  const [value, setValue] = useState<T>(() => fromToday(today))
  const prev = useRef(today)
  useEffect(() => {
    if (prev.current === today) return
    const old = fromToday(prev.current)
    prev.current = today
    setValue((v) => (v === old ? fromToday(today) : v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])
  return [value, setValue] as const
}
