import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import Today from './components/Today'
import Settings from './components/Settings'
import Analysis from './components/Analysis'
import Body from './components/Body'
import Exercise from './components/Exercise'
import ProfileForm from './components/ProfileForm'
import { AuthForm } from './components/Account'
import { useSync } from './lib/sync'

type Tab = 'today' | 'stats' | 'exercise' | 'body' | 'settings'

export default function App() {
  const profile = useLiveQuery(() => db.profile.get('me'), [], null)
  const [tab, setTab] = useState<Tab>('today')

  if (profile === null) return null // กำลังโหลด

  if (!profile) return <Welcome />

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      {tab === 'today' && <Today profile={profile} onOpenAccount={() => setTab('settings')} onOpenStats={() => setTab('stats')} />}
      {tab === 'stats' && <Analysis profile={profile} />}
      {tab === 'exercise' && <Exercise profile={profile} />}
      {tab === 'body' && <Body profile={profile} />}
      {tab === 'settings' && <Settings profile={profile} />}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg">
          {(
            [
              ['today', '📋', 'บันทึก'],
              ['stats', '📊', 'สถิติ'],
              ['exercise', '🏃', 'ออกกำลัง'],
              ['body', '🧬', 'ร่างกาย'],
              ['settings', '⚙️', 'ตั้งค่า'],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 flex-col items-center py-2 text-xs ${
                tab === key ? 'font-semibold text-emerald-700' : 'text-slate-500'
              }`}
            >
              <span className="text-xl">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Welcome() {
  const sync = useSync()
  const [login, setLogin] = useState(false)
  const signedIn = sync.status !== 'signed-out' && !!sync.userId

  return (
    <div className="mx-auto max-w-lg px-4 pb-10 pt-8">
      <h1 className="text-2xl font-bold text-emerald-700">ยินดีต้อนรับสู่ AIEAT 👋</h1>
      {signedIn ? (
        <div className="mt-4 rounded-2xl bg-white p-4 text-sm shadow-sm">
          {sync.status === 'syncing' ? (
            <p>🔄 กำลังดึงข้อมูลจากบัญชี {sync.email}…</p>
          ) : sync.status === 'error' ? (
            <p className="text-red-600">⚠️ ดึงข้อมูลไม่สำเร็จ: {sync.error}</p>
          ) : (
            <p>☁️ เข้าสู่ระบบด้วย {sync.email} แล้ว ยังไม่มีโปรไฟล์ในบัญชีนี้ — กรอกข้อมูลด้านล่างเพื่อเริ่มใช้งาน</p>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          {login ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">☁️ เข้าสู่ระบบ / สมัครสมาชิก</h2>
                <button onClick={() => setLogin(false)} className="text-sm text-slate-500">ยกเลิก</button>
              </div>
              <AuthForm />
            </>
          ) : (
            <button onClick={() => setLogin(true)} className="w-full text-left text-sm">
              <span className="font-semibold text-emerald-700">มีบัญชีแล้ว? เข้าสู่ระบบ ›</span>
              <span className="mt-0.5 block text-slate-500">ดึงข้อมูลเดิมกลับมา หรือสมัครเพื่อซิงก์หลายเครื่อง (ไม่บังคับ)</span>
            </button>
          )}
        </div>
      )}
      {!(signedIn && sync.status === 'syncing') && (
        <>
          <p className="mt-5 text-sm text-slate-600">
            กรอกข้อมูลด้านล่างเพื่อคำนวณว่าควรกินวันละกี่แคลอรี่จึงจะลดน้ำหนักได้ตามเป้า
          </p>
          <div className="mt-3">
            <ProfileForm />
          </div>
        </>
      )}
    </div>
  )
}
