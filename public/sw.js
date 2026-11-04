// Service worker: ทำให้เปิดแอปได้แม้ออฟไลน์
// - หน้าเว็บ (navigation): network-first แล้ว fallback เป็น cache
// - ไฟล์อื่น (JS/CSS/ฟอนต์/ไอคอน): stale-while-revalidate
const CACHE = 'aieat-v2'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE)
      await c.addAll(CORE)
      // เก็บไฟล์ JS/CSS ที่หน้าเว็บใช้ไว้ด้วย เพื่อให้เปิดออฟไลน์ได้ตั้งแต่ครั้งแรก
      const html = await (await fetch('./index.html', { cache: 'no-cache' })).text()
      const assets = [...html.matchAll(/(?:src|href)="(?:\.\/)?(assets\/[^"]+)"/g)].map((m) => './' + m[1])
      if (assets.length) await c.addAll(assets)
    })(),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const cacheable = (url) =>
  url.origin === self.location.origin ||
  url.hostname === 'fonts.googleapis.com' ||
  url.hostname === 'fonts.gstatic.com'

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (!cacheable(url)) return

  if (req.mode === 'navigate') {
    e.respondWith(
      // no-cache: ข้าม HTTP cache ของเบราว์เซอร์ (GitHub Pages ให้เก็บได้ 10 นาที) เพื่อให้ได้เวอร์ชันล่าสุดทันที
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true })),
    )
    return
  }

  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreVary: true })
      const net = fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone())
          return res
        })
        .catch(() => hit)
      return hit || net
    }),
  )
})
