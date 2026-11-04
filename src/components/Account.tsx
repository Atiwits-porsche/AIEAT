import { useState } from 'react'
import { resetPassword, signIn, signOutAndClear, signUp, syncNow, updatePassword, useSync } from '../lib/sync'

const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500'

export function AuthForm({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') {
        await signIn(email.trim(), pw)
        onDone?.()
      } else if (mode === 'up') {
        const r = await signUp(email.trim(), pw)
        if (r.needsConfirm) setMsg({ ok: true, text: `ส่งอีเมลยืนยันไปที่ ${email.trim()} แล้ว — กดลิงก์ในอีเมล แล้วกลับมาเข้าสู่ระบบ` })
        else onDone?.()
      } else {
        await resetPassword(email.trim())
        setMsg({ ok: true, text: 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว' })
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode !== 'forgot' && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {(['in', 'up'] as const).map((m) => (
            <button type="button" key={m} onClick={() => { setMode(m); setMsg(null) }}
              className={`rounded-lg py-1.5 ${mode === m ? 'bg-white font-semibold text-emerald-700 shadow-sm' : 'text-slate-600'}`}>
              {m === 'in' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>
          ))}
        </div>
      )}
      <input className={input} type="email" autoComplete="email" placeholder="อีเมล" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode !== 'forgot' && (
        <input className={input} type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)" required minLength={6}
          value={pw} onChange={(e) => setPw(e.target.value)} />
      )}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:bg-slate-300">
        {busy ? 'กำลังดำเนินการ…' : mode === 'in' ? 'เข้าสู่ระบบ' : mode === 'up' ? 'สมัครสมาชิก' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
      </button>
      <div className="text-center text-sm">
        {mode === 'forgot'
          ? <button type="button" onClick={() => setMode('in')} className="text-slate-500 underline">กลับไปหน้าเข้าสู่ระบบ</button>
          : mode === 'in' && <button type="button" onClick={() => { setMode('forgot'); setMsg(null) }} className="text-slate-500 underline">ลืมรหัสผ่าน?</button>}
      </div>
    </form>
  )
}

function NewPassword() {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault()
      try { await updatePassword(pw); setMsg('✅ ตั้งรหัสผ่านใหม่แล้ว') } catch (err) { setMsg(err instanceof Error ? err.message : String(err)) }
    }}>
      <p className="text-sm font-medium">ตั้งรหัสผ่านใหม่</p>
      <input className={input} type="password" autoComplete="new-password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="รหัสผ่านใหม่" />
      <button className="w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white">บันทึกรหัสผ่าน</button>
      {msg && <p className="text-sm">{msg}</p>}
    </form>
  )
}

const STATUS: Record<string, { icon: string; text: string; cls: string }> = {
  syncing: { icon: '🔄', text: 'กำลังซิงก์…', cls: 'text-slate-600' },
  synced: { icon: '☁️', text: 'ซิงก์แล้ว', cls: 'text-emerald-700' },
  offline: { icon: '📴', text: 'ออฟไลน์ — จะซิงก์เมื่อกลับมาออนไลน์', cls: 'text-amber-700' },
  error: { icon: '⚠️', text: 'ซิงก์ไม่สำเร็จ', cls: 'text-red-600' },
}

export function AccountCard() {
  const s = useSync()
  const [busy, setBusy] = useState(false)

  if (s.status === 'signed-out' || !s.userId) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">☁️ บัญชีและซิงก์ข้อมูล</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">
          สมัครหรือเข้าสู่ระบบเพื่อเก็บข้อมูลบนคลาวด์ ใช้ได้หลายเครื่อง และไม่หายถ้าเปลี่ยนมือถือ —
          ข้อมูลที่บันทึกไว้ในเครื่องนี้จะถูกย้ายขึ้นบัญชีให้อัตโนมัติ
        </p>
        <AuthForm />
      </section>
    )
  }

  const st = STATUS[s.status] ?? STATUS.synced
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">☁️ บัญชีและซิงก์ข้อมูล</h2>
      <div className="mt-2 text-sm">
        <div>เข้าสู่ระบบด้วย <b>{s.email}</b></div>
        <div className={`mt-1 ${st.cls}`}>
          {st.icon} {st.text}
          {s.pending > 0 && s.status !== 'syncing' && ` · รอส่ง ${s.pending} รายการ`}
          {s.lastSync && s.status === 'synced' && <span className="text-slate-400"> · {new Date(s.lastSync).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        {s.status === 'error' && s.error && <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">{s.error}</p>}
      </div>
      {s.recovery && <div className="mt-3"><NewPassword /></div>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => syncNow()} className="rounded-xl border border-slate-300 py-2 text-sm font-medium text-slate-700">🔄 ซิงก์ตอนนี้</button>
        <button
          disabled={busy}
          onClick={async () => {
            const warn = s.pending > 0 ? `\n\n⚠️ ยังมี ${s.pending} รายการที่ยังไม่ได้ส่งขึ้นคลาวด์ จะพยายามส่งก่อนออก` : ''
            if (!confirm(`ออกจากระบบ? ข้อมูลในเครื่องนี้จะถูกล้าง (ยังอยู่บนคลาวด์ เข้าสู่ระบบใหม่เพื่อดึงกลับมา)${warn}`)) return
            setBusy(true)
            try { await signOutAndClear() } finally { setBusy(false) }
          }}
          className="rounded-xl border border-red-200 py-2 text-sm font-medium text-red-600"
        >ออกจากระบบ</button>
      </div>
    </section>
  )
}
