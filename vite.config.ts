import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' ทำให้ deploy บน GitHub Pages (path ย่อย) ได้โดยไม่ต้องตั้งค่าเพิ่ม
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
