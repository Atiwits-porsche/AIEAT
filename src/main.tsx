import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './lib/install'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ขอให้เบราว์เซอร์เก็บข้อมูลถาวร (ลดโอกาสที่ IndexedDB ถูกลบเมื่อพื้นที่เต็ม)
navigator.storage?.persist?.().catch(() => {})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW register failed', e))
  })
}
