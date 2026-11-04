import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import Today from './components/Today'
import Settings from './components/Settings'
import Analysis from './components/Analysis'
import Body from './components/Body'
import ProfileForm from './components/ProfileForm'

type Tab = 'today' | 'stats' | 'body' | 'settings'

export default function App() {
  const profile = useLiveQuery(() => db.profile.get('me'), [], null)
  const [tab, setTab] = useState<Tab>('today')

  if (profile === null) return null // กำลังโหลด

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-10 pt-8">
        <h1 className="text-2xl font-bold text-emerald-700">ยินดีต้อนรับสู่ AIEAT 👋</h1>
        <p className="mt-1 text-sm text-slate-600">
          กรอกข้อมูลด้านล่างเพื่อคำนวณว่าควรกินวันละกี่แคลอรี่จึงจะลดน้ำหนักได้ตามเป้า
        </p>
        <div className="mt-5">
          <ProfileForm />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      {tab === 'today' && <Today profile={profile} />}
      {tab === 'stats' && <Analysis profile={profile} />}
      {tab === 'body' && <Body profile={profile} />}
      {tab === 'settings' && <Settings profile={profile} />}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg">
          {(
            [
              ['today', '📋', 'บันทึก'],
              ['stats', '📊', 'สถิติ'],
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
