import { useState } from 'react'
import { db, type Profile, type WeightLog } from '../lib/db'
import { avg7, calorieTarget, fmt1, fmtInt, minKcal, type MeasuredBmr } from '../lib/calc'
import { addDays, formatThaiDate } from '../lib/date'
import { dayIndex, dateRange } from '../lib/stats'
import { addMonths, currentWeight, getPlan, planAt, requiredRate, trendPerDay, type Plan } from '../lib/plan'
import { C, Legend, TipRow, Tooltip, niceTicks, useWidth } from './Charts'

const MONTH_CHOICES = [3, 6, 9, 12]

export default function PlanCard({ profile, weights, today, measured }: {
  profile: Profile
  weights: WeightLog[]
  today: string
  measured?: MeasuredBmr
}) {
  const saved = getPlan(profile, weights)
  const current = currentWeight(profile, weights, today)
  const [draft, setDraft] = useState<number | null>(null)

  // แผนที่แสดง: ตัวอย่างที่กำลังเลือก หรือแผนที่ใช้อยู่
  const previewing = draft !== null && !(saved.custom && saved.months === draft && saved.start === today)
  const plan: Plan = previewing
    ? { start: today, startWeight: Math.round(current * 10) / 10, end: addMonths(today, draft!), goal: profile.goalWeight, months: draft!, custom: true }
    : saved
  const need = requiredRate(plan, current, today)
  const applyRate = need !== undefined ? Math.min(1, Math.max(0.1, Math.round(need * 100) / 100)) : undefined
  const slope = trendPerDay(weights, today)
  const diff = current - planAt(plan, today)
  const reached = current <= profile.goalWeight

  // เป้าแคล: ตัวอย่าง = คำนวณจากความเร็วที่แผนต้องการ, แผนที่ใช้อยู่ = ค่าที่ทั้งแอปใช้จริง
  const t = calorieTarget({ ...profile, ratePerWeek: previewing && applyRate ? applyRate : profile.ratePerWeek }, current, measured)
  const floorHit = t.floored
  const outOfSync = !previewing && plan.custom && applyRate !== undefined && Math.abs(applyRate - profile.ratePerWeek) > 0.02

  const trendDays = slope !== undefined && slope < -0.005 ? Math.ceil((current - profile.goalWeight) / -slope) : undefined
  const trendDate = trendDays !== undefined && trendDays > 0 ? addDays(today, trendDays) : undefined

  async function applyPlan() {
    if (draft === null || applyRate === undefined) return
    await db.profile.update('me', {
      planStartDate: today,
      planStartWeight: Math.round(current * 10) / 10,
      planMonths: draft,
      ratePerWeek: applyRate,
    })
    setDraft(null)
  }
  async function resetPlan() {
    await db.profile.update('me', { planStartDate: undefined, planStartWeight: undefined, planMonths: undefined })
    setDraft(null)
  }
  const activeChip = draft ?? (saved.custom ? saved.months : null)

  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ${previewing ? 'ring-2 ring-emerald-300' : ''}`}>
      <h2 className="mb-2 font-semibold">📈 แผนและแนวโน้มน้ำหนัก</h2>

      {/* แผนที่ใช้อยู่ */}
      <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
        {saved.custom ? (
          <>
            <div className="font-medium">✅ ใช้แผน {saved.months} เดือนอยู่ · ลด {profile.ratePerWeek} กก./สัปดาห์</div>
            <div className="text-xs text-slate-500">
              เริ่ม {formatThaiDate(saved.start)} ({fmt1(saved.startWeight)} กก.) → ถึงเป้า {fmt1(saved.goal)} กก. {formatThaiDate(saved.end)} ·{' '}
              <button onClick={resetPlan} className="underline">ยกเลิกแผน</button>
            </div>
          </>
        ) : (
          <>
            <div className="font-medium">ยังไม่ได้ตั้งแผน · ใช้ความเร็ว {profile.ratePerWeek} กก./สัปดาห์จากโปรไฟล์</div>
            <div className="text-xs text-slate-500">คาดว่าถึงเป้าประมาณ {formatThaiDate(saved.end)} ({saved.months} เดือน) — เลือกจำนวนเดือนด้านล่างเพื่อตั้งแผน</div>
          </>
        )}
      </div>

      {/* เลือกระยะเวลาแผน */}
      <div className="text-xs text-slate-500">ลดจาก {fmt1(current)} → {fmt1(profile.goalWeight)} กก. ภายใน</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {MONTH_CHOICES.map((m) => (
          <button
            key={m}
            onClick={() => setDraft(m)}
            className={`rounded-full border px-3 py-1 text-sm ${activeChip === m ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700' : 'border-slate-200 text-slate-600'}`}
          >{m} เดือน</button>
        ))}
        <CustomMonths active={activeChip !== null && !MONTH_CHOICES.includes(activeChip) ? activeChip : undefined} onSet={setDraft} />
      </div>

      {previewing && <p className="mt-2 text-xs font-medium text-emerald-700">👀 ตัวอย่างแผน {draft} เดือน (ยังไม่ได้ใช้) — กด “ใช้แผนนี้” ด้านล่างเพื่อเริ่มใช้</p>}

      {/* สรุปแผน */}
      {!reached && need !== undefined && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="ต้องลด" value={need.toFixed(2)} unit="กก./สัปดาห์" tone={need > 1 ? 'bad' : need > 0.75 ? 'warn' : undefined} />
          <Stat label={previewing ? 'จะกินวันละ' : 'กินวันละ (ตอนนี้)'} value={fmtInt(t.target)} unit="kcal" tone={floorHit ? 'warn' : undefined} />
          {previewing ? (
            <Stat label="ถึงเป้า" value={formatThaiDate(plan.end).replace(/^\S+\s/, '')} unit={`${plan.months} เดือน`} />
          ) : (
            <Stat
              label="เทียบแผนวันนี้"
              value={Math.abs(diff) < 0.3 ? 'ตามแผน' : `${diff > 0 ? '+' : ''}${fmt1(diff)}`}
              unit={Math.abs(diff) < 0.3 ? '✓' : diff > 0 ? 'กก. ช้ากว่าแผน' : 'กก. เร็วกว่าแผน'}
              tone={Math.abs(diff) < 0.3 || diff < 0 ? 'good' : 'warn'}
            />
          )}
        </div>
      )}
      {reached && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">🎉 ถึงน้ำหนักเป้าหมายแล้ว ตั้งเป้าใหม่ได้ในหน้าตั้งค่า</p>}
      {need === undefined && !reached && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">แผนนี้ครบกำหนดแล้วแต่ยังไม่ถึงเป้า เลือกจำนวนเดือนเพื่อตั้งแผนใหม่</p>
      )}
      {need !== undefined && need > 1 && (
        <p className="mt-2 text-xs text-red-600">⚠️ เร็วเกินไป (เกิน 1 กก./สัปดาห์) — ถ้าใช้แผนนี้ เป้าแคลจะคิดที่ 1 กก./สัปดาห์ ซึ่งอาจไม่ทันกำหนด แนะนำเพิ่มจำนวนเดือน</p>
      )}
      {floorHit && need !== undefined && (
        <p className="mt-2 text-xs text-amber-700">
          เป้าแคลติดขั้นต่ำ {fmtInt(minKcal(profile.sex))} kcal — ลดด้วยการกินอย่างเดียวอาจไม่ทัน ควรเพิ่มการออกกำลังกาย หรือขยายเวลาแผน
        </p>
      )}

      {previewing && !reached && applyRate !== undefined && (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button onClick={applyPlan} className="rounded-xl bg-emerald-600 py-2.5 font-semibold text-white">
            ✅ ใช้แผน {draft} เดือนนี้
          </button>
          <button onClick={() => setDraft(null)} className="rounded-xl border border-slate-300 px-4 text-sm text-slate-600">ยกเลิก</button>
          <p className="col-span-2 text-[11px] text-slate-500">
            จะตั้งความเร็วเป็น {applyRate} กก./สัปดาห์ และเป้าแคลวันละ {fmtInt(t.target)} kcal ทั้งแอป (หน้าบันทึก สถิติ และตั้งค่า)
          </p>
        </div>
      )}
      {outOfSync && !reached && (
        <button
          onClick={() => db.profile.update('me', { ratePerWeek: applyRate })}
          className="mt-2 w-full rounded-xl border border-emerald-300 py-2 text-sm font-medium text-emerald-700"
        >
          🔄 ปรับเป้าแคลให้ทันแผน: ต้องลด {applyRate} กก./สัปดาห์ (ตอนนี้ตั้งไว้ {profile.ratePerWeek})
        </button>
      )}

      <PlanChart plan={plan} weights={weights} today={today} slope={slope} current={current} />

      <p className="mt-2 text-xs text-slate-600">
        {trendDate
          ? <>ตามแนวโน้มจริง 4 สัปดาห์ล่าสุด ({fmt1(-slope! * 7)} กก./สัปดาห์) จะถึงเป้าประมาณ <b>{formatThaiDate(trendDate)}</b>{trendDate > plan.end ? ' — ช้ากว่าแผน' : ' — ทันตามแผน 👍'}</>
          : slope !== undefined
            ? <span className="text-amber-700">⚠️ 4 สัปดาห์ล่าสุดน้ำหนักยังไม่ลด ({slope > 0 ? '+' : ''}{fmt1(slope * 7)} กก./สัปดาห์) ลองเช็กว่าบันทึกอาหารครบทุกมื้อ หรือเพิ่มการออกกำลังกาย</span>
            : 'ชั่งน้ำหนักเช้าต่อเนื่องอย่างน้อย 5 วันในช่วง 7 วันขึ้นไป แล้วจะแสดงเส้นแนวโน้มจริง'}
      </p>
    </section>
  )
}

function CustomMonths({ active, onSet }: { active?: number; onSet: (m: number) => void }) {
  const [v, setV] = useState(active ? String(active) : '')
  const n = Number(v)
  return (
    <span className={`inline-flex items-center rounded-full border pl-2 text-sm ${active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
      <input
        type="number" inputMode="numeric" min={1} max={36} placeholder="อื่นๆ" value={v}
        onChange={(e) => setV(e.target.value)}
        className="w-12 bg-transparent py-1 text-center outline-none"
        aria-label="จำนวนเดือน"
      />
      <button disabled={!(n >= 1 && n <= 36)} onClick={() => onSet(Math.round(n))} className="rounded-r-full px-2 py-1 text-emerald-700 disabled:text-slate-300">ตั้ง</button>
    </span>
  )
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: 'good' | 'warn' | 'bad' }) {
  const c = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-700' : 'text-slate-800'
  return (
    <div className="rounded-xl bg-slate-50 px-1 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-lg font-bold leading-tight ${c}`}>{value}</div>
      <div className="text-[10px] text-slate-500">{unit}</div>
    </div>
  )
}

const H = 230
const M = { l: 36, r: 10, t: 14, b: 26 }
const monthLabel = (d: string) => {
  const [y, m] = d.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
}

function PlanChart({ plan, weights, today, slope, current }: {
  plan: Plan; weights: WeightLog[]; today: string; slope?: number; current: number
}) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<string | null>(null)

  const firstW = weights.filter((w) => w.morningKg).map((w) => w.date).sort()[0]
  const from = firstW && firstW < plan.start ? firstW : plan.start
  const trendEnd = slope !== undefined && slope < -0.005
    ? addDays(today, Math.ceil((current - plan.goal) / -slope))
    : undefined
  let to = plan.end > today ? plan.end : addDays(today, 14)
  if (trendEnd && trendEnd > to) to = trendEnd < addDays(plan.end, 180) ? trendEnd : addDays(plan.end, 180)

  const days = dateRange(from, to)
  const byDate = new Map(weights.map((w) => [w.date, w]))
  const avgs = new Map<string, number>()
  for (const d of days) {
    if (d > today) break
    const a = avg7(weights, d, addDays)
    if (a) avgs.set(d, a.value)
  }
  const trendAt = (d: string) =>
    slope !== undefined && slope < -0.005 && d >= today ? Math.max(plan.goal, current + slope * (dayIndex(d) - dayIndex(today))) : undefined

  const vals = [plan.startWeight, plan.goal, current, ...avgs.values(), ...weights.filter((w) => w.date >= from && w.morningKg).map((w) => w.morningKg!)]
  const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1
  const { ticks } = niceTicks(lo, hi)
  const x0 = dayIndex(from), x1 = dayIndex(to)
  const iw = W - M.l - M.r, ih = H - M.t - M.b
  const x = (d: string) => M.l + ((dayIndex(d) - x0) / Math.max(1, x1 - x0)) * iw
  const y = (v: number) => M.t + ih - ((v - lo) / (hi - lo)) * ih

  // ป้ายเดือน (ต้นเดือน) เว้นระยะไม่ให้ชนกัน
  const months = days.filter((d) => d.endsWith('-01'))
  const step = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(W / 64))))
  const monthTicks = months.filter((_, i) => i % step === 0)

  let avgPath = ''
  let pen = false
  for (const d of days) {
    const v = avgs.get(d)
    if (v === undefined) { pen = false; continue }
    avgPath += `${pen ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
  }
  const tEnd = trendEnd && trendEnd < to ? trendEnd : to
  const showTrend = slope !== undefined && slope < -0.005
  const r = days.length > 120 ? 2 : 3

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    const i = Math.round((px / iw) * (x1 - x0))
    setHover(days[Math.max(0, Math.min(days.length - 1, i))])
  }

  const hw = hover ? byDate.get(hover)?.morningKg : undefined
  const ha = hover ? avgs.get(hover) : undefined
  const ht = hover ? trendAt(hover) : undefined

  return (
    <div ref={ref} className="relative mt-4">
      <Legend items={[
        { label: 'เฉลี่ย 7 วัน', color: C.s1, kind: 'line' },
        { label: 'เช้า', color: C.s2, kind: 'dot' },
        { label: 'แผน', color: C.s3, kind: 'dash' },
        ...(showTrend ? [{ label: 'แนวโน้มจริง', color: C.s1, kind: 'dash' as const }] : []),
      ]} />
      <div className="relative">
        <svg width={W} height={H} role="img" aria-label="กราฟแผนและแนวโน้มน้ำหนัก" className="block touch-pan-y">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={C.axis}>{t % 1 ? t.toFixed(1) : t}</text>
            </g>
          ))}
          {monthTicks.map((d) => (
            <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="10" fill={C.axis}>{monthLabel(d)}</text>
          ))}
          {/* เป้าหมาย */}
          <line x1={M.l} x2={W - M.r} y1={y(plan.goal)} y2={y(plan.goal)} stroke={C.grid} strokeWidth="1.5" />
          <text x={W - M.r} y={y(plan.goal) + 12} textAnchor="end" fontSize="10" fill={C.text2}>เป้า {fmt1(plan.goal)}</text>
          {/* วันนี้ */}
          <line x1={x(today)} x2={x(today)} y1={M.t} y2={M.t + ih} stroke={C.axis} strokeDasharray="2 3" />
          <text x={x(today)} y={M.t - 3} textAnchor="middle" fontSize="10" fill={C.text2}>วันนี้</text>
          {/* แผน */}
          <line x1={x(plan.start)} y1={y(plan.startWeight)} x2={x(plan.end)} y2={y(plan.goal)} stroke={C.s3} strokeWidth="2" strokeDasharray="6 4" />
          <circle cx={x(plan.end)} cy={y(plan.goal)} r="4" fill={C.s3} stroke="#fff" strokeWidth="1.5" />
          {/* แนวโน้มจริงต่อจากวันนี้ */}
          {showTrend && (
            <line x1={x(today)} y1={y(current)} x2={x(tEnd)} y2={y(trendAt(tEnd)!)} stroke={C.s1} strokeWidth="2" strokeDasharray="3 3" />
          )}
          {weights.filter((w) => w.morningKg && w.date >= from && w.date <= today).map((w) => (
            <circle key={w.date} cx={x(w.date)} cy={y(w.morningKg!)} r={r} fill={C.s2} stroke="#fff" strokeWidth="1" />
          ))}
          <path d={avgPath} fill="none" stroke={C.s1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} stroke={C.axis} />}
          <rect x={M.l} y={M.t} width={iw} height={ih} fill="transparent"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover && (
          <Tooltip x={x(hover)} width={W}>
            <div className="mb-0.5 text-slate-500">{formatThaiDate(hover)}</div>
            {ha !== undefined && <TipRow color={C.s1} label="เฉลี่ย 7 วัน" value={`${fmt1(ha)} กก.`} />}
            {hw !== undefined && <TipRow color={C.s2} label="เช้า" value={`${fmt1(hw)} กก.`} />}
            <TipRow color={C.s3} label="แผน" value={`${fmt1(planAt(plan, hover))} กก.`} />
            {ht !== undefined && <TipRow color={C.s1} label="แนวโน้ม" value={`${fmt1(ht)} กก.`} />}
          </Tooltip>
        )}
      </div>
    </div>
  )
}
