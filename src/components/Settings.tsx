import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAll, importAll, type Profile } from '../lib/db'
import { latestWeight } from '../lib/calc'
import { todayStr } from '../lib/date'
import ProfileForm from './ProfileForm'
import { useMeasuredBmr } from '../lib/body'
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../lib/install'

export default function Settings({ profile }: { profile: Profile }) {
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? []
  const custom = useLiveQuery(() => db.customFoods.toArray(), []) ?? []
  const [msg, setMsg] = useState('')
  const measured = useMeasuredBmr(profile)
  const fileRef = useRef<HTMLInputElement>(null)

  async function doExport() {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `aieat-backup-${todayStr()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function doImport(file: File) {
    if (!confirm('นำเข้าข้อมูลจะ "แทนที่" ข้อมูลทั้งหมดในเครื่องนี้ ต้องการดำเนินการต่อหรือไม่?')) return
    try {
      await importAll(JSON.parse(await file.text()))
      setMsg('✅ นำเข้าข้อมูลเรียบร้อย')
    } catch (e) {
      setMsg(`❌ นำเข้าไม่สำเร็จ: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      <h1 className="text-lg font-semibold">ตั้งค่า</h1>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">โปรไฟล์และเป้าหมาย</h2>
        <ProfileForm
          key={JSON.stringify(profile)}
          profile={profile}
          currentWeight={latestWeight(weights, todayStr())}
          measured={measured}
          onSaved={() => setMsg('✅ บันทึกโปรไฟล์แล้ว')}
        />
        <p className="mt-2 text-[11px] text-slate-400">เป้าแคลอรี่คำนวณจากน้ำหนักล่าสุดที่บันทึกไว้ และจะปรับลดลงเองเมื่อน้ำหนักลดลง</p>
      </section>

      {msg && <p className="text-sm">{msg}</p>}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">เมนูของฉัน ({custom.length})</h2>
        {custom.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">ยังไม่มี เพิ่มได้จากหน้าเพิ่มอาหาร</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {custom.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>{c.name} <span className="text-xs text-slate-400">/ {c.unit} · {c.kcal} kcal</span></span>
                <button
                  onClick={() => confirm(`ลบ “${c.name}”?`) && db.customFoods.delete(c.id!)}
                  className="text-slate-300 hover:text-red-500"
                  aria-label={`ลบ ${c.name}`}
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <InstallCard />

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">สำรองข้อมูล</h2>
        <p className="mt-1 text-sm text-slate-500">
          ข้อมูลทั้งหมดเก็บไว้ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ควร export เก็บไว้เป็นระยะ หรือใช้ย้ายไปเครื่องใหม่
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={doExport} className="rounded-xl bg-emerald-600 py-2.5 font-semibold text-white">⬇️ Export</button>
          <button onClick={() => fileRef.current?.click()} className="rounded-xl border border-slate-300 py-2.5 font-semibold text-slate-700">⬆️ Import</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) doImport(f)
            e.target.value = ''
          }}
        />
      </section>
    </div>
  )
}

function InstallCard() {
  const [can, setCan] = useState(canPromptInstall())
  useEffect(() => onInstallChange(() => setCan(canPromptInstall())), [])
  if (isStandalone()) return null
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">📲 ติดตั้งเป็นแอปบนมือถือ</h2>
      <p className="mt-1 text-sm text-slate-500">เปิดจากหน้าจอโฮมได้เหมือนแอปทั่วไป และใช้งานได้แม้ไม่มีอินเทอร์เน็ต</p>
      {can ? (
        <button onClick={promptInstall} className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white">ติดตั้งแอป</button>
      ) : isIOS() ? (
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          บน iPhone/iPad: เปิดใน <b>Safari</b> → กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรขึ้น) → เลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b>
        </p>
      ) : (
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          บน Android/Chrome: กดเมนู <b>⋮</b> มุมขวาบน → <b>“ติดตั้งแอป”</b> หรือ <b>“เพิ่มลงในหน้าจอหลัก”</b>
        </p>
      )}
    </section>
  )
}
