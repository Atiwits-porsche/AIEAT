import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAll, type CustomFood, type Profile } from '../lib/db'
import { builtinExact } from '../lib/foods'
import { saveFood } from '../lib/foodEdit'
import FoodEditor from './FoodEditor'
import { latestWeight } from '../lib/calc'
import { todayStr } from '../lib/date'
import ProfileForm from './ProfileForm'
import { AccountCard } from './Account'
import { importAndSync } from '../lib/sync'
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
      await importAndSync(JSON.parse(await file.text()))
      setMsg('✅ นำเข้าข้อมูลเรียบร้อย')
    } catch (e) {
      setMsg(`❌ นำเข้าไม่สำเร็จ: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      <h1 className="text-lg font-semibold">ตั้งค่า</h1>

      <AccountCard />

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

      <MyFoodsCard custom={custom} />

      <InstallCard />

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">สำรองข้อมูล</h2>
        <p className="mt-1 text-sm text-slate-500">
          ดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์ไว้เป็นสำเนาสำรอง (ถ้ายังไม่ได้เข้าสู่ระบบ ข้อมูลอยู่ในเครื่องนี้เท่านั้น ควร export เป็นระยะ)
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
      <p className="pb-2 text-center text-[11px] text-slate-400">AIEAT เวอร์ชัน {__APP_VERSION__}</p>
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

/** เมนูของฉัน + เมนูในรายการที่แก้ค่าเอง — แก้แคล/สารอาหาร หรือลบ/คืนค่าเดิม */
function MyFoodsCard({ custom }: { custom: CustomFood[] }) {
  const [edit, setEdit] = useState<CustomFood | null>(null)
  const mine = custom.filter((c) => !builtinExact(c.name, c.unit))
  const edited = custom.filter((c) => builtinExact(c.name, c.unit))
  const Row = ({ c, builtin }: { c: CustomFood; builtin?: boolean }) => (
    <li className="flex items-center gap-2 py-2 text-sm">
      <span className="min-w-0 flex-1">
        {c.name} <span className="text-xs text-slate-400">/ {c.unit} · {c.kcal} kcal</span>
        {c.n && (
          <span className="block text-[11px] text-slate-500">
            โปรตีน {c.n.protein} g · ไขมัน {c.n.fat} g · น้ำตาล {c.n.sugar} g · โซเดียม {c.n.sodium} mg
          </span>
        )}
      </span>
      <button onClick={() => setEdit(c)} className="shrink-0 rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-emerald-700" aria-label={`แก้ค่า ${c.name}`}>✏️ แก้</button>
      {builtin ? (
        <button
          onClick={() => {
            const b = builtinExact(c.name, c.unit)!
            if (confirm(`คืนค่าเดิมของ “${c.name}”? รายการที่บันทึกไปแล้วจะกลับเป็นค่าเดิมด้วย`)) void saveFood(c.name, c.unit, b.kcal, b.n, true)
          }}
          className="shrink-0 text-xs text-slate-400 underline"
          aria-label={`คืนค่าเดิม ${c.name}`}
        >คืนค่าเดิม</button>
      ) : (
        <button
          onClick={() => confirm(`ลบ “${c.name}”?`) && db.customFoods.delete(c.id!)}
          className="shrink-0 px-1 text-lg text-slate-300 hover:text-red-500"
          aria-label={`ลบ ${c.name}`}
        >×</button>
      )}
    </li>
  )
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">เมนูของฉัน ({mine.length})</h2>
      {mine.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">ยังไม่มี เพิ่มได้จากหน้าเพิ่มอาหาร</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">{mine.map((c) => <Row key={c.id} c={c} />)}</ul>
      )}
      {edited.length > 0 && (
        <>
          <h3 className="mt-3 text-sm font-semibold">เมนูในรายการที่แก้ค่า ({edited.length})</h3>
          <ul className="mt-1 divide-y divide-slate-100">{edited.map((c) => <Row key={c.id} c={c} builtin />)}</ul>
        </>
      )}
      <p className="mt-2 text-[11px] text-slate-400">แก้ค่าเมนูอื่นในรายการได้จากหน้าเพิ่มอาหาร: เลือกเมนู แล้วกด ✏️ แก้ค่า</p>
      {edit && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={() => setEdit(null)}>
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
            <FoodEditor name={edit.name} unit={edit.unit} kcal={edit.kcal} n={edit.n ?? builtinExact(edit.name, edit.unit)?.n}
              onCancel={() => setEdit(null)} onSaved={() => setEdit(null)} />
          </div>
        </div>
      )}
    </section>
  )
}
