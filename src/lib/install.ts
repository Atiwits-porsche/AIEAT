// เก็บ event beforeinstallprompt ไว้ (มักเกิดก่อนผู้ใช้เปิดหน้าตั้งค่า)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

export const canPromptInstall = () => deferred !== null
export const onInstallChange = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
export async function promptInstall() {
  if (!deferred) return
  await deferred.prompt()
  await deferred.userChoice
  deferred = null
  notify()
}
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
