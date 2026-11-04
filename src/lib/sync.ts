// ซิงก์ข้อมูลกับ Supabase แบบ local-first:
// - แอปอ่าน/เขียน IndexedDB เหมือนเดิม (เร็ว ใช้ออฟไลน์ได้)
// - ทุกการเปลี่ยนแปลงถูกจดลง syncQueue แล้วส่งขึ้นตาราง `records` เมื่อออนไลน์และล็อกอินอยู่
// - ดึงการเปลี่ยนแปลงจากเครื่องอื่นตาม updated_at (server เป็นผู้กำหนดเวลา)
import { createClient, type Session } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import type { Table, Transaction } from 'dexie'
import { db, newUid, type SyncItem } from './db'

// ค่า publishable key ออกแบบให้ใส่ในเว็บได้ (สิทธิ์ถูกจำกัดด้วย Row Level Security)
export const SUPABASE_URL = 'https://mgbwnusndqatfwovdlqa.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_pCP7Y_wP6N4VKnEavaPvVQ_zoCry7kq'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

type Kind = 'profile' | 'weights' | 'entries' | 'customFoods' | 'bodyScans' | 'activities'
interface KindDef { kind: Kind; table: Table; byUid: boolean }

const KINDS: KindDef[] = [
  { kind: 'profile', table: db.profile, byUid: false },
  { kind: 'weights', table: db.weights, byUid: false },
  { kind: 'entries', table: db.entries, byUid: true },
  { kind: 'customFoods', table: db.customFoods, byUid: true },
  { kind: 'bodyScans', table: db.bodyScans, byUid: true },
  { kind: 'activities', table: db.activities, byUid: true },
]
const defOf = (k: string) => KINDS.find((d) => d.kind === k)
const REMOTE = '__aieatRemote'

// ---------- สถานะ (ให้ React อ่านได้) ----------
export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'
interface State { status: SyncStatus; email?: string; userId?: string; lastSync?: number; error?: string; pending: number; recovery?: boolean }
let state: State = { status: 'signed-out', pending: 0 }
const subs = new Set<() => void>()
function set(p: Partial<State>) {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}
export const useSync = () =>
  useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)

// ---------- จดการเปลี่ยนแปลงในเครื่อง ----------
let buffer: SyncItem[] = []
let bufferTimer: number | undefined
function enqueue(kind: Kind, key: string, deleted: boolean) {
  buffer.push({ id: `${kind}:${key}`, kind, key, deleted, at: Date.now() + buffer.length / 1000 })
  window.clearTimeout(bufferTimer)
  bufferTimer = window.setTimeout(async () => {
    const items = buffer
    buffer = []
    await db.syncQueue.bulkPut(items)
    set({ pending: await db.syncQueue.count() })
    schedulePush()
  }, 50)
}

const isRemote = (tx: Transaction) => (tx as unknown as Record<string, boolean>)[REMOTE] === true

for (const d of KINDS) {
  d.table.hook('creating', function (primKey, obj, tx) {
    if (d.byUid && !obj.uid) obj.uid = newUid()
    if (isRemote(tx)) return
    const key = String(d.byUid ? obj.uid : primKey ?? obj.id ?? obj.date)
    tx.on('complete', () => enqueue(d.kind, key, false))
  })
  d.table.hook('updating', function (modifications, primKey, obj, tx) {
    // put() ที่ส่ง object ใหม่ไม่มี uid ต้องไม่ทำให้ uid หาย
    const mods = modifications as Record<string, unknown>
    const keep = d.byUid && 'uid' in mods && !mods.uid ? { uid: obj.uid } : undefined
    if (!isRemote(tx)) {
      const key = String(d.byUid ? obj.uid : primKey)
      tx.on('complete', () => enqueue(d.kind, key, false))
    }
    return keep
  })
  d.table.hook('deleting', function (primKey, obj, tx) {
    if (isRemote(tx)) return
    const key = String(d.byUid ? obj.uid : primKey)
    if (key && key !== 'undefined') tx.on('complete', () => enqueue(d.kind, key, true))
  })
}

// ---------- ส่งขึ้น (push) ----------
let pushTimer: number | undefined
let pushing = false
function schedulePush() {
  window.clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => void push(), 800)
}

function strip(obj: Record<string, unknown>, byUid: boolean) {
  if (!byUid) return obj
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = obj
  return rest
}

async function localOf(d: KindDef, key: string) {
  return d.byUid ? d.table.where('uid').equals(key).first() : d.table.get(key)
}

async function push() {
  const uid = state.userId
  if (!uid || pushing || !navigator.onLine) return
  pushing = true
  try {
    const items = await db.syncQueue.toArray()
    for (let i = 0; i < items.length; i += 300) {
      const chunk = items.slice(i, i + 300)
      const rows = []
      for (const it of chunk) {
        const d = defOf(it.kind)
        if (!d) continue
        // ส่งสถานะปัจจุบันในเครื่องเสมอ (คิวบอกแค่ว่า key นี้เปลี่ยน) — ไม่มีในเครื่องแล้ว = ลบ
        const obj = await localOf(d, it.key)
        rows.push({
          user_id: uid,
          kind: it.kind,
          key: it.key,
          data: obj ? strip(obj, d.byUid) : null,
          deleted: !obj,
        })
      }
      const { error } = await supabase.from('records').upsert(rows, { onConflict: 'user_id,kind,key' })
      if (error) throw error
      // ลบออกจากคิวเฉพาะรายการที่ไม่ถูกแก้ซ้ำระหว่างส่ง
      await db.transaction('rw', db.syncQueue, async () => {
        for (const it of chunk) {
          const cur = await db.syncQueue.get(it.id)
          if (cur && cur.at === it.at) await db.syncQueue.delete(it.id)
        }
      })
    }
    set({ pending: await db.syncQueue.count(), status: 'synced', lastSync: Date.now(), error: undefined })
  } catch (e) {
    set({ status: navigator.onLine ? 'error' : 'offline', error: errText(e) })
  } finally {
    pushing = false
  }
  if (state.pending > 0 && state.status === 'synced') schedulePush()
}

// ---------- ดึงลง (pull) ----------
const cursorKey = (uid: string) => `aieat.sync.cursor.${uid}`
const OVERLAP_MS = 5000

interface Row { kind: string; key: string; data: Record<string, unknown> | null; deleted: boolean; updated_at: string }

async function fetchSince(since?: string) {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('records').select('kind,key,data,deleted,updated_at').order('updated_at', { ascending: true }).range(from, from + 999)
    if (since) q = q.gt('updated_at', since)
    const { data, error } = await q
    if (error) throw error
    out.push(...(data as Row[]))
    if (!data || data.length < 1000) break
  }
  return out
}

async function applyRows(rows: Row[]) {
  const pending = new Set((await db.syncQueue.toArray()).map((i) => i.id))
  const tables = KINDS.map((k) => k.table)
  await db.transaction('rw', tables, async (tx) => {
    ;(tx as unknown as Record<string, boolean>)[REMOTE] = true
    for (const r of rows) {
      const d = defOf(r.kind)
      if (!d || pending.has(`${r.kind}:${r.key}`)) continue // มีแก้ในเครื่องที่ยังไม่ได้ส่ง ให้ฝั่งเครื่องชนะ
      if (d.byUid) {
        const ex = await d.table.where('uid').equals(r.key).first()
        if (r.deleted || !r.data) {
          if (ex) await d.table.delete(ex.id)
        } else {
          await d.table.put(ex ? { ...r.data, uid: r.key, id: ex.id } : { ...r.data, uid: r.key })
        }
      } else if (r.deleted || !r.data) {
        await d.table.delete(r.key)
      } else {
        await d.table.put(r.data)
      }
    }
  })
}

/** ครั้งแรกที่ล็อกอินบนเครื่องนี้: รวมข้อมูลในเครื่องเข้ากับบนคลาวด์ (คลาวด์ชนะถ้า key ซ้ำ) */
async function enqueueLocalNotIn(serverKeys: Set<string>) {
  const items: SyncItem[] = []
  for (const d of KINDS) {
    const all = await d.table.toArray()
    for (const o of all) {
      const key = String(d.byUid ? o.uid : d.kind === 'profile' ? o.id : o.date)
      if (!key || key === 'undefined' || serverKeys.has(`${d.kind}:${key}`)) continue
      items.push({ id: `${d.kind}:${key}`, kind: d.kind, key, deleted: false, at: Date.now() + items.length / 1000 })
    }
  }
  if (items.length) await db.syncQueue.bulkPut(items)
}

/** หลังนำเข้าไฟล์: ส่งข้อมูลทั้งหมดในเครื่องขึ้นคลาวด์ใหม่ (รายการที่ถูกลบจะถูกส่งเป็นลบจากคิว) */
export async function importAndSync(data: unknown) {
  const { importAll } = await import('./db')
  await importAll(data)
  await enqueueLocalNotIn(new Set())
  set({ pending: await db.syncQueue.count() })
  schedulePush()
}

let syncing = false
export async function syncNow() {
  const uid = state.userId
  if (!uid || syncing) return
  if (!navigator.onLine) return set({ status: 'offline' })
  syncing = true
  set({ status: 'syncing' })
  try {
    const prev = localStorage.getItem(cursorKey(uid))
    const since = prev ? new Date(new Date(prev).getTime() - OVERLAP_MS).toISOString() : undefined
    const rows = await fetchSince(since)
    await applyRows(rows)
    if (!prev) await enqueueLocalNotIn(new Set(rows.map((r) => `${r.kind}:${r.key}`)))
    const last = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), prev ?? '1970-01-01T00:00:00Z')
    localStorage.setItem(cursorKey(uid), last)
    syncing = false
    await push()
    if (state.status === 'syncing') set({ status: 'synced', lastSync: Date.now() })
  } catch (e) {
    syncing = false
    set({ status: navigator.onLine ? 'error' : 'offline', error: errText(e) })
  }
}

// ---------- บัญชีผู้ใช้ ----------
function onSession(s: Session | null) {
  if (s?.user) {
    const changed = state.userId !== s.user.id
    set({ userId: s.user.id, email: s.user.email ?? undefined, status: state.status === 'signed-out' ? 'syncing' : state.status })
    if (changed) void syncNow()
  } else {
    set({ userId: undefined, email: undefined, status: 'signed-out', error: undefined })
  }
}

let started = false
export function startSync() {
  if (started) return
  started = true
  supabase.auth.getSession().then(({ data }) => onSession(data.session))
  supabase.auth.onAuthStateChange((event, s) => {
    if (event === 'PASSWORD_RECOVERY') set({ error: undefined, recovery: true })
    onSession(s)
  })
  db.syncQueue.count().then((n) => set({ pending: n }))
  window.setInterval(() => void syncNow(), 60_000)
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => state.userId && set({ status: 'offline' }))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow())
}

const redirectTo = () => window.location.origin + window.location.pathname

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } })
  if (error) throw new Error(errText(error))
  return { needsConfirm: !data.session }
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(errText(error))
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })
  if (error) throw new Error(errText(error))
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(errText(error))
  set({ recovery: false })
}

/** ออกจากระบบ และล้างข้อมูลในเครื่อง (ข้อมูลยังอยู่บนคลาวด์) */
export async function signOutAndClear() {
  await push()
  const uid = state.userId
  await supabase.auth.signOut()
  if (uid) localStorage.removeItem(cursorKey(uid))
  const tables = [...KINDS.map((k) => k.table), db.syncQueue]
  await db.transaction('rw', tables, async (tx) => {
    ;(tx as unknown as Record<string, boolean>)[REMOTE] = true
    for (const t of tables) await t.clear()
  })
  set({ pending: 0 })
}

function errText(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (/Invalid login credentials/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (/Email not confirmed/i.test(m)) return 'ยังไม่ได้ยืนยันอีเมล — กดลิงก์ในอีเมลที่ได้รับก่อน'
  if (/already registered|already been registered/i.test(m)) return 'อีเมลนี้สมัครแล้ว — ลองเข้าสู่ระบบ'
  if (/Password should be at least/i.test(m)) return 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร'
  if (/rate limit|too many/i.test(m)) return 'ส่งคำขอบ่อยเกินไป รอสักครู่แล้วลองใหม่'
  if (/relation .*records.* does not exist|Could not find the table/i.test(m)) return 'ยังไม่ได้สร้างตารางใน Supabase — รันไฟล์ใน supabase/migrations ใน SQL Editor ก่อน'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'
  return m
}
