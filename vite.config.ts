import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' ทำให้ deploy บน GitHub Pages (path ย่อย) ได้โดยไม่ต้องตั้งค่าเพิ่ม
declare const process: { env: Record<string, string | undefined> }
const sha = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7)
const built = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(`${sha} · ${built} UTC`) },
  plugins: [react(), tailwindcss()],
})
