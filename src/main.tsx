import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './lib/install'
import { startSync } from './lib/sync'

startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ขอให้เบราว์เซอร์เก็บข้อมูลถาวร (ลดโอกาสที่ IndexedDB ถูกลบเมื่อพื้นที่เต็ม)
navigator.storage?.persist?.().catch(() => {})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // เช็กเวอร์ชันใหม่ทุกครั้งที่กลับมาเปิดแอป
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg?.update().catch(() => {}))
      })
      .catch((e) => console.warn('SW register failed', e))
  })
  // มี service worker เวอร์ชันใหม่มาแทน → โหลดหน้าใหม่ครั้งเดียวให้ได้โค้ดล่าสุด
  const hadController = !!navigator.serviceWorker.controller
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return
    reloaded = true
    window.location.reload()
  })
}
