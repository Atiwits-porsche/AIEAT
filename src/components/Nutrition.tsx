import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type MealEntry, type WeightLog } from '../lib/db'
import {
  GUIDES, NUT, NUT_KEYS, SODIUM_MG_PER_TSP_SALT, SUGAR_G_PER_TSP, TIPS,
  byDate, customIndex, fmtN, periodRows, status, sumEntries, topContributors,
  type Limits, type NutKey, type Nutrients, type Period, type PeriodRow,
} from '../lib/nutrition'
import { addDays } from '../lib/date'
import { dayQuality } from '../lib/quality'
import { DayQualityLine } from './Indicators'
import { C, Legend, TipRow, Tooltip, linePath, niceTicks, shortDate, useWidth, xLabelIdx } from './Charts'

export function useCustomIndex() {
  const custom = useLiveQuery(() => db.customFoods.toArray(), [])
  return useMemo(() => customIndex(custom ?? []), [custom])
}

const BAR: Record<ReturnType<typeof status>, string> = {
  ok: 'bg-emerald-500',
  near: 'bg-amber-500',
  over: 'bg-red-500',
  low: 'bg-sky-500',
}

/** คำอธิบายสั้นใต้แถบของแต่ละสารอาหาร */
function hint(key: NutKey, v: number, limit: number) {
  if (key === 'protein') return v >= limit ? 'ถึงเป้าแล้ว ✓' : `ขาดอีก ${fmtN(key, limit - v)} g`
  const left = limit - v
  const extra =
    key === 'sugar' ? ` · ≈ ${(v / SUGAR_G_PER_TSP).toFixed(1)} ช้อนชา` :
    key === 'sodium' ? ` · ≈ เกลือ ${(v / SODIUM_MG_PER_TSP_SALT).toFixed(1)} ช้อนชา` : ''
  return (left >= 0 ? `เหลือ ${fmtN(key, left)} ${NUT[key].unit}` : `เกิน ${fmtN(key, -left)} ${NUT[key].unit}`) + extra
}

/** การ์ดสารอาหารของวันนั้น (หน้าบันทึก) */
export function NutrientsCard({ entries, limits, onOpenStats }: { entries: MealEntry[]; limits: Limits; onOpenStats?: () => void }) {
  const custom = useCustomIndex()
  const s = sumEntries(entries, custom)
  return (
    <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">🧪 น้ำตาล ไขมัน โซเดียม โปรตีน</h2>
        {onOpenStats && <button onClick={onOpenStats} className="text-xs text-emerald-700 underline">ดูแนวโน้ม ›</button>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
        {NUT_KEYS.map((k) => <NutrientBar key={k} k={k} value={s.total[k]} limit={limits[k]} />)}
      </div>
      <DayQualityLine q={dayQuality(entries, limits, custom)} />
      {s.unknown > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">* {s.unknown} รายการไม่มีข้อมูลสารอาหาร (เมนูที่เพิ่มเองโดยไม่ได้ใส่ค่า) จึงไม่ถูกนับ</p>
      )}
      <PlanBasis limits={limits} />
    </section>
  )
}

/** บอกว่าโควตาคิดจากแผนอย่างไร */
export function PlanBasis({ limits }: { limits: Limits }) {
  const n = (v: number) => v.toLocaleString('th-TH')
  const parts = [
    `ไขมัน ≤ ${limits.fat} g (30%)`,
    `น้ำตาล ≤ ${limits.sugar} g${limits.sugarScaled ? ' (5% ของแคล)' : ''}`,
    `โปรตีน ${limits.proteinPerKg} g/กก.${limits.proteinBoost ? ` (${limits.proteinBoost})` : ''}`,
    `โซเดียมคงที่ ${n(limits.sodium)} มก.`,
  ]
  return (
    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
      🎯 ผูกกับแผน: เป้า {n(limits.kcal)} kcal → {parts.join(' · ')}
    </p>
  )
}

/** วันก่อนกินเค็มเกิน → เตือนว่าน้ำหนักเช้าที่ขึ้นน่าจะเป็นน้ำ */
export function SodiumWaterNote({ date, weights, limit }: { date: string; weights: WeightLog[]; limit: number }) {
  const prev = addDays(date, -1)
  const prevEntries = useLiveQuery(() => db.entries.where('date').equals(prev).toArray(), [prev])
  const custom = useCustomIndex()
  if (!prevEntries?.length) return null
  const sodium = sumEntries(prevEntries, custom).total.sodium
  if (sodium <= limit) return null
  const w0 = weights.find((w) => w.date === prev)?.morningKg
  const w1 = weights.find((w) => w.date === date)?.morningKg
  const rise = w0 && w1 ? w1 - w0 : undefined
  return (
    <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900" role="note">
      💧 เมื่อวานโซเดียม {fmtN('sodium', sodium)} มก. (เกณฑ์ {limit.toLocaleString('th-TH')})
      {rise === undefined
        ? ' — ถ้าเช้านี้น้ำหนักขึ้น น่าจะเป็นน้ำที่ร่างกายเก็บไว้ ไม่ใช่ไขมัน'
        : rise > 0
          ? ` — น้ำหนักเช้านี้ขึ้น ${rise.toFixed(1)} กก. ส่วนใหญ่น่าจะเป็นน้ำที่ร่างกายเก็บไว้ ไม่ใช่ไขมัน`
          : ' — น้ำหนักเช้านี้ไม่ขึ้น ดีมาก'}
      {(rise === undefined || rise > 0) && ' จะลงเองใน 2–3 วัน ดื่มน้ำเปล่าให้พอและกลับมากินจืดตามแผน'}
    </p>
  )
}

export function NutrientBar({ k, value, limit }: { k: NutKey; value: number; limit: number }) {
  const st = status(k, value, limit)
  const pct = Math.min(100, limit ? (value / limit) * 100 : 0)
  const tone = st === 'over' ? 'text-red-600' : st === 'near' ? 'text-amber-700' : 'text-slate-500'
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-slate-700">{NUT[k].icon} {NUT[k].label}</span>
        <span className="text-slate-600">
          <b className={st === 'over' ? 'text-red-600' : 'text-slate-900'}>{fmtN(k, value)}</b>
          {' '}/ {fmtN(k, limit)} {NUT[k].unit}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100" role="meter" aria-valuenow={Math.round(value)} aria-valuemax={limit} aria-label={NUT[k].label}>
        <div className={`h-2 rounded-full ${BAR[st]}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-0.5 text-[10px] ${tone}`}>{hint(k, value, limit)}</div>
    </div>
  )
}

/** ข้อความสารอาหารสั้นๆ ของรายการอาหาร */
export function EntryNutrients({ n, lead = true }: { n?: Nutrients; lead?: boolean }) {
  if (!n) return null
  const warnSugar = n.sugar >= 12
  const warnNa = n.sodium >= 1000
  const warnFat = n.fat >= 25
  return (
    <span className="text-[11px] text-slate-400">
      {lead && ' · '}โปรตีน {fmtN('protein', n.protein)}g
      {' · '}<span className={warnFat ? 'text-amber-600' : ''}>ไขมัน {fmtN('fat', n.fat)}g</span>
      {n.sugar > 0 && <>{' · '}<span className={warnSugar ? 'text-amber-600' : ''}>น้ำตาล {fmtN('sugar', n.sugar)}g</span></>}
      {' · '}<span className={warnNa ? 'text-amber-600' : ''}>โซเดียม {fmtN('sodium', n.sodium)}</span>
    </span>
  )
}

// ---------------- หน้าสถิติ ----------------

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'รายวัน' },
  { key: 'week', label: 'รายสัปดาห์' },
  { key: 'month', label: 'รายเดือน' },
]

const monthLabel = (d: string) => {
  const [y, m] = d.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
}
const periodLabel = (r: PeriodRow, p: Period) =>
  p === 'day' ? shortDate(r.start) : p === 'week' ? `${shortDate(r.start)}–${shortDate(r.end)}` : monthLabel(r.start)

export function NutritionAnalysis({ entries, limits, from, today }: {
  entries: MealEntry[]; limits: Limits; from: string; today: string
}) {
  const custom = useCustomIndex()
  const [key, setKey] = useState<NutKey>('sugar')
  const [period, setPeriod] = useState<Period>('day')
  const sums = useMemo(() => byDate(entries, custom), [entries, custom])

  const data = useMemo(() => {
    const windowFrom = period === 'day' ? from : period === 'week' ? addDays(today, -7 * 11) : `${addMonthsStr(today, -5).slice(0, 8)}01`
    const all = periodRows(sums, period, windowFrom, today)
    // ตัดช่วงต้นที่ยังไม่เคยบันทึกออก (สัปดาห์/เดือนก่อนเริ่มใช้แอป)
    const first = all.findIndex((r) => r.logged)
    const rows = period === 'day' || first <= 0 ? all : all.slice(first)
    const week = periodRows(sums, 'week', today, today)[0]
    const month = periodRows(sums, 'month', today, today)[0]
    // สรุปเฉลี่ยต่อวันในช่วงที่เลือก (ไม่นับวันนี้ที่ยังกินไม่ครบ)
    const days = periodRows(sums, 'day', from, addDays(today, -1)).filter((r) => r.logged)
    const overview = NUT_KEYS.map((k) => {
      const avg = days.length ? days.reduce((s, r) => s + r.total[k], 0) / days.length : undefined
      const hit = days.filter((r) => (NUT[k].kind === 'goal' ? r.total[k] >= limits[k] : r.total[k] > limits[k])).length
      return { k, avg, hit }
    })
    const inRange = entries.filter((e) => e.date >= from && e.date <= today)
    return {
      rows, week, month, overview, logged: days.length,
      top: topContributors(inRange, key, custom),
      unknown: periodRows(sums, 'day', from, today).reduce((s, r) => s + r.unknown, 0),
    }
  }, [sums, period, from, today, key, limits, entries, custom])

  const meta = NUT[key]
  const lim = limits[key]
  const goal = meta.kind === 'goal'
  const g = GUIDES[key]

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold">🧪 น้ำตาล ไขมัน โซเดียม โปรตีน</h2>

      {/* ภาพรวมทุกตัว */}
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="px-1 py-1 text-left font-medium">เฉลี่ยต่อวัน</th>
              <th className="px-1 font-medium">กินจริง</th>
              <th className="px-1 font-medium">เกณฑ์/วัน</th>
              <th className="px-1 font-medium">วันที่{''}เกิน/ถึง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.overview.map(({ k, avg, hit }) => {
              const st = avg === undefined ? undefined : status(k, avg, limits[k])
              return (
                <tr key={k} onClick={() => setKey(k)} className={`cursor-pointer ${k === key ? 'bg-emerald-50/60' : ''}`}>
                  <td className="px-1 py-1.5 text-left">{NUT[k].icon} {NUT[k].label}</td>
                  <td className={`px-1 font-semibold ${st === 'over' ? 'text-red-600' : st === 'ok' ? 'text-emerald-700' : st === 'low' ? 'text-sky-700' : 'text-amber-700'}`}>
                    {avg !== undefined ? `${fmtN(k, avg)}` : '–'}
                  </td>
                  <td className="px-1 text-slate-600">{NUT[k].kind === 'goal' ? '≥ ' : '≤ '}{fmtN(k, limits[k])} {NUT[k].unit}</td>
                  <td className="px-1 text-slate-600">
                    {data.logged ? `${NUT[k].kind === 'goal' ? 'ถึง' : 'เกิน'} ${hit}/${data.logged}` : '–'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">ไม่นับวันนี้ · แตะแถวเพื่อดูรายละเอียด</p>

      {/* เลือกสารอาหาร */}
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 text-xs">
        {NUT_KEYS.map((k) => (
          <button key={k} onClick={() => setKey(k)}
            className={`rounded-lg py-1.5 ${key === k ? 'bg-white font-semibold text-emerald-700 shadow-sm' : 'text-slate-600'}`}>
            {NUT[k].icon} {NUT[k].label}
          </button>
        ))}
      </div>

      {/* แผน: ไม่ควรเกิน / ควรได้ ต่อวัน สัปดาห์ เดือน */}
      <div className="mt-3 rounded-xl bg-slate-50 p-3">
        <div className="text-sm font-medium">{goal ? `🎯 ${meta.label}ที่ควรได้อย่างน้อย` : `⛔ ${meta.label}ไม่ควรเกิน`}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Budget label="ต่อวัน" v={lim} k={key} />
          <Budget label="ต่อสัปดาห์" v={lim * 7} k={key} />
          <Budget label={`ต่อเดือน (${data.month.days} วัน)`} v={lim * data.month.days} k={key} />
        </div>
        {key === 'sugar' && (
          <p className="mt-2 text-[11px] text-slate-500">
            = {fmtN('sugar', lim / SUGAR_G_PER_TSP)} ช้อนชา/วัน · {fmtN('sugar', (lim * 7) / SUGAR_G_PER_TSP)} ช้อนชา/สัปดาห์
            {limits.sugarScaled && ` · ลดจาก 24 g เป็น 5% ของเป้า ${limits.kcal.toLocaleString('th-TH')} kcal ตามแผน`}
          </p>
        )}
        {key === 'sodium' && <p className="mt-2 text-[11px] text-slate-500">≈ เกลือ 1 ช้อนชา/วัน · มื้อหลักละไม่ควรเกิน ~600 มก. · ไม่ผูกกับแผน เพราะโซเดียมไม่มีแคล แต่ทำให้บวมน้ำ</p>}
        {key === 'fat' && <p className="mt-2 text-[11px] text-slate-500">30% ของเป้าแคล {limits.kcal.toLocaleString('th-TH')} kcal ตามแผน (เป้าแคลลด โควตาไขมันก็ลดตาม)</p>}
        {key === 'protein' && (
          <p className="mt-2 text-[11px] text-slate-500">
            {limits.proteinPerKg}–1.6 g × {limits.refWeight.toFixed(1)} กก.{limits.adjusted && ' (น้ำหนักอ้างอิง เพราะ BMI ≥ 30)'} = {limits.protein}–{limits.proteinHigh} g/วัน
            {limits.proteinBoost && ` · เพิ่มจาก 1.2 เพราะ${limits.proteinBoost} ช่วยรักษากล้ามเนื้อ`}
          </p>
        )}
        <div className="mt-3 space-y-2">
          <Progress label="สัปดาห์นี้" row={data.week} k={key} perDay={lim} today={today} />
          <Progress label="เดือนนี้" row={data.month} k={key} perDay={lim} today={today} />
        </div>
      </div>

      {/* กราฟ trend */}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs">
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`rounded-lg py-1.5 ${period === p.key ? 'bg-white font-semibold text-emerald-700 shadow-sm' : 'text-slate-600'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <NutrientChart rows={data.rows} k={key} perDay={lim} period={period} />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {period === 'day' ? 'ช่วงเวลาตามตัวกรองด้านบน' : period === 'week' ? '12 สัปดาห์ล่าสุด · รวมทั้งสัปดาห์' : '6 เดือนล่าสุด · รวมทั้งเดือน'}
        {period !== 'day' && ' · วันที่ไม่ได้บันทึกนับเป็น 0 · ช่วงปัจจุบันแสดงจางเพราะยังไม่จบ'}
      </p>

      {data.top.length > 0 && (
        <div className="mt-3">
          <div className="text-sm font-medium">{goal ? `🏆 แหล่ง${meta.label}หลักของคุณ` : `🔎 เมนูที่ให้${meta.label}มากที่สุด`}</div>
          <ol className="mt-1 divide-y divide-slate-100 text-sm">
            {data.top.map((f, i) => (
              <li key={f.name} className="flex justify-between py-1.5">
                <span className="min-w-0 truncate">{i + 1}. {f.name} <span className="text-xs text-slate-400">× {f.times}</span></span>
                <span className="shrink-0 text-slate-600">{fmtN(key, f.value)} {meta.unit}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-3">
        <div className="text-sm font-medium">💡 {goal ? `เพิ่ม${meta.label}` : `ลด${meta.label}`}</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
          {TIPS[key].map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>

      {data.unknown > 0 && (
        <p className="mt-3 text-[11px] text-slate-400">* ในช่วงนี้มี {data.unknown} รายการที่ไม่มีข้อมูลสารอาหาร (เมนูที่เพิ่มเองโดยไม่ได้ใส่ค่า) จึงไม่ถูกนับ — ใส่ค่าได้ตอนเพิ่มเมนูเอง</p>
      )}

      <details className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">📚 เกณฑ์นี้มาจากไหน</summary>
        <ul className="mt-2 space-y-1">
          {g.sources.map(([who, what]) => (
            <li key={who} className="flex justify-between gap-2"><span>{who}</span><span className="text-right text-slate-500">{what}</span></li>
          ))}
        </ul>
        <p className="mt-2 font-medium text-emerald-800">→ {g.chosen}</p>
        {g.note && <p className="mt-1 text-slate-500">{g.note}</p>}
        <p className="mt-2 text-slate-400">ค่าสารอาหารของเมนูเป็นค่าประมาณกลางๆ จากตารางคุณค่าอาหารไทย (สถาบันโภชนาการ ม.มหิดล), USDA และข้อมูลที่หน่วยงานสาธารณสุขเผยแพร่ — ของจริงต่างกันตามร้านและสูตร</p>
      </details>
    </section>
  )
}

function addMonthsStr(date: string, n: number) {
  const [y, m] = date.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function Budget({ label, v, k }: { label: string; v: number; k: NutKey }) {
  return (
    <div className="rounded-lg bg-white px-1 py-2 shadow-sm">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-800">{fmtN(k, v)}</div>
      <div className="text-[10px] text-slate-400">{NUT[k].unit}</div>
    </div>
  )
}

function Progress({ label, row, k, perDay, today }: { label: string; row: PeriodRow; k: NutKey; perDay: number; today: string }) {
  const budget = perDay * row.days
  const v = row.total[k]
  const goal = NUT[k].kind === 'goal'
  // เทียบกับเกณฑ์ของวันที่ผ่านมาแล้วในช่วงนี้ (นับถึงวันนี้)
  const elapsed = row.partial ? Math.min(row.days, dayDiff(row.start, today) + 1) : row.days
  const soFar = perDay * elapsed
  const st = status(k, v, goal ? soFar : budget)
  const pct = Math.min(100, (v / budget) * 100)
  const pace = (elapsed / row.days) * 100
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span className="text-slate-600">{label} <span className="text-slate-400">({row.logged} วันที่บันทึก)</span></span>
        <span><b className={st === 'over' ? 'text-red-600' : 'text-slate-900'}>{fmtN(k, v)}</b> / {fmtN(k, budget)} {NUT[k].unit}</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${BAR[st]}`} style={{ width: `${pct}%` }} />
        <div className="absolute -top-0.5 h-3 w-0.5 bg-slate-500" style={{ left: `${pace}%` }} title="เกณฑ์ถึงวันนี้" />
      </div>
      <div className={`mt-0.5 text-[10px] ${st === 'over' ? 'text-red-600' : 'text-slate-500'}`}>
        {goal
          ? v >= soFar ? 'ทันเป้าของวันที่ผ่านมาแล้ว ✓' : `ตามหลังเป้า ${fmtN(k, soFar - v)} ${NUT[k].unit} (ถึงวันนี้ควรได้ ${fmtN(k, soFar)})`
          : v > budget ? `เกินโควตาแล้ว ${fmtN(k, v - budget)} ${NUT[k].unit}` : `เหลือโควตา ${fmtN(k, budget - v)} ${NUT[k].unit}${v > soFar ? ` · เร็วกว่าแผน (ถึงวันนี้ควร ≤ ${fmtN(k, soFar)})` : ''}`}
      </div>
    </div>
  )
}

function dayDiff(a: string, b: string) {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(b) - t(a)) / 86400000)
}

// ---------------- กราฟ ----------------

const H = 200
const M = { l: 42, r: 10, t: 12, b: 26 }

function NutrientChart({ rows, k, perDay, period }: { rows: PeriodRow[]; k: NutKey; perDay: number; period: Period }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const meta = NUT[k]
  const goal = meta.kind === 'goal'

  if (!rows.some((r) => r.logged)) {
    return <div ref={ref} className="py-10 text-center text-sm text-slate-400">ยังไม่มีบันทึกอาหารในช่วงนี้</div>
  }

  const n = rows.length
  const iw = W - M.l - M.r
  const ih = H - M.t - M.b
  const limitOfRow = (r: PeriodRow) => perDay * r.days
  // เส้นแนวโน้ม: เฉลี่ย 7 วันเฉพาะวันที่มีบันทึก (รายวันเท่านั้น)
  const avg = period === 'day'
    ? rows.map((_, i) => {
        const win = rows.slice(Math.max(0, i - 6), i + 1).filter((r) => r.logged)
        return win.length >= 2 && rows[i].logged ? win.reduce((s, r) => s + r.total[k], 0) / win.length : undefined
      })
    : []
  const max = Math.max(...rows.map((r) => Math.max(r.total[k], limitOfRow(r)))) * 1.05
  const { step } = niceTicks(0, max, 4)
  // ปัดแกนขึ้นถึงขีดถัดไป เพื่อให้มีป้ายตัวเลขด้านบนเสมอ
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100)
  const col = iw / n
  const gap = col > 6 ? 2 : col > 3 ? 1 : 0
  const bw = Math.max(1, col - gap)
  const y = (v: number) => M.t + ih - (v / top) * ih
  const cx = (i: number) => M.l + col * i + col / 2

  const bar = (i: number, v: number) => {
    const x0 = M.l + col * i + gap / 2
    const y0 = y(v)
    const h = M.t + ih - y0
    const rr = Math.min(4, bw / 2, h)
    return `M${x0},${M.t + ih}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bw - rr}Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr}V${M.t + ih}Z`
  }
  const good = (r: PeriodRow) => (goal ? r.total[k] >= limitOfRow(r) : r.total[k] <= limitOfRow(r))
  const colorOf = (r: PeriodRow) => (good(r) ? (goal ? C.s3 : C.s1) : goal ? C.s1 : C.critical)
  const limitPath = rows.map((r, i) => `${i ? 'L' : 'M'}${M.l + col * i},${y(limitOfRow(r))}H${M.l + col * (i + 1)}`).join('')
  const anyBad = rows.some((r) => r.logged && !good(r) && !(goal && r.partial))
  const hr = hover !== null ? rows[hover] : null
  const unit = meta.unit
  const fmtTick = (t: number) => (t >= 1000 ? `${t / 1000}k` : String(t))

  const legend: Parameters<typeof Legend>[0]['items'] = goal
    ? [
        { label: 'ถึงเป้า', color: C.s3, kind: 'rect' as const },
        ...(anyBad ? [{ label: 'ยังไม่ถึง', color: C.s1, kind: 'rect' as const }] : []),
        { label: 'เป้าขั้นต่ำ', color: C.ref, kind: 'dash' as const },
      ]
    : [
        { label: 'ไม่เกิน', color: C.s1, kind: 'rect' as const },
        ...(anyBad ? [{ label: 'เกินเกณฑ์', color: C.critical, kind: 'rect' as const }] : []),
        { label: 'เกณฑ์สูงสุด', color: C.ref, kind: 'dash' as const },
      ]
  if (period === 'day') legend.push({ label: 'เฉลี่ย 7 วัน', color: C.ink, kind: 'line' })

  return (
    <div ref={ref} className="relative">
      <Legend items={legend} />
      <div className="relative">
        <svg width={W} height={H} role="img" aria-label={`กราฟ${meta.label}${PERIODS.find((p) => p.key === period)!.label}`} className="block touch-pan-y">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={C.axis}>{fmtTick(t)}</text>
            </g>
          ))}
          {xLabelIdx(n, W).map((i) => (
            <text key={i} x={cx(i)} y={H - 8} textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill={C.axis}>
              {period === 'month' ? monthLabel(rows[i].start) : shortDate(rows[i].start)}
            </text>
          ))}
          {rows.map((r, i) =>
            r.logged && r.total[k] > 0 ? (
              <path key={r.start} d={bar(i, r.total[k])} fill={colorOf(r)}
                opacity={(hover === null || hover === i ? 1 : 0.55) * (r.partial ? 0.45 : 1)} />
            ) : null,
          )}
          <path d={limitPath} fill="none" stroke={C.ref} strokeWidth="1.5" strokeDasharray="4 3" />
          {period === 'day' && (
            <path d={linePath(avg, cx, y)} fill="none" stroke={C.ink} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          )}
          {rows.map((r, i) => (
            <rect key={`h${r.start}`} x={M.l + col * i} y={M.t} width={col} height={ih} fill="transparent"
              onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onPointerLeave={() => setHover(null)} />
          ))}
        </svg>
        {hr && (
          <Tooltip x={cx(hover!)} width={W}>
            <div className="mb-0.5 text-slate-500">{periodLabel(hr, period)}{hr.partial && ' (ยังไม่จบ)'}</div>
            {hr.logged ? (
              <>
                <TipRow kind="rect" color={colorOf(hr)} label={meta.label} value={`${fmtN(k, hr.total[k])} ${unit}`} />
                <TipRow color={C.ref} label={goal ? 'เป้า' : 'เกณฑ์'} value={`${fmtN(k, limitOfRow(hr))} ${unit}`} />
                {period === 'day' && avg[hover!] !== undefined && <TipRow color={C.ink} label="เฉลี่ย 7 วัน" value={`${fmtN(k, avg[hover!]!)}`} />}
                {period !== 'day' && <div className="text-slate-500">บันทึก {hr.logged}/{hr.days} วัน · เฉลี่ย {fmtN(k, hr.total[k] / hr.logged)}/วัน</div>}
                <div className={good(hr) ? 'text-emerald-700' : goal ? 'text-sky-700' : 'text-red-600'}>
                  {goal
                    ? good(hr) ? '✓ ถึงเป้า' : `ขาด ${fmtN(k, limitOfRow(hr) - hr.total[k])}`
                    : good(hr) ? `✓ เหลือ ${fmtN(k, limitOfRow(hr) - hr.total[k])}` : `▲ เกิน ${fmtN(k, hr.total[k] - limitOfRow(hr))}`}
                </div>
              </>
            ) : (
              <div className="text-slate-400">ไม่ได้บันทึก</div>
            )}
          </Tooltip>
        )}
      </div>
    </div>
  )
}
