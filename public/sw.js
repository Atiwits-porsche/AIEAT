// Service worker: ทำให้เปิดแอปได้แม้ออฟไลน์
// - หน้าเว็บ (navigation): network-first แล้ว fallback เป็น cache
// - ไฟล์อื่น (JS/CSS/ฟอนต์/ไอคอน): stale-while-revalidate
const CACHE = 'aieat-v1'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)))
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
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req)
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
