import { useEffect, useState, type ReactNode } from 'react'
import type { DaySummary } from '../lib/stats'
import { fmt1, fmtInt } from '../lib/calc'
import { todayStr } from '../lib/date'

// สีตามบทบาท (reference palette ของ dataviz skill — โหมดสว่าง)
export const C = {
  s1: '#2a78d6',
  s2: '#eb6834',
  s3: '#1baf7a',
  critical: '#e34948',
  grid: '#e7e8e6',
  axis: '#8a8984',
  text2: '#52514e',
  ref: '#9a9993',
}

const H = 220
const M = { l: 38, r: 10, t: 12, b: 26 }

/** callback ref: ติดตามความกว้างของ element ปัจจุบันเสมอ แม้ element จะถูกสลับ */
function useWidth() {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [w, setW] = useState(320)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w] as const
}

function niceTicks(lo: number, hi: number, max = 5) {
  const span = hi - lo || 1
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 250, 500, 1000]
  const step = steps.find((s) => span / s <= max) ?? 2000
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100)
  return { ticks: out, step }
}

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function xLabelIdx(n: number, w: number) {
  const k = Math.max(2, Math.min(6, Math.floor(w / 70)))
  if (n <= k) return [...Array(n).keys()]
  const out = new Set<number>()
  for (let i = 0; i < k; i++) out.add(Math.round((i * (n - 1)) / (k - 1)))
  return [...out]
}

export function Legend({ items }: { items: { label: string; color: string; kind: 'line' | 'dot' | 'rect' | 'dash' }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <svg width="16" height="10" aria-hidden>
            {it.kind === 'line' && <line x1="1" x2="15" y1="5" y2="5" stroke={it.color} strokeWidth="2" strokeLinecap="round" />}
            {it.kind === 'dash' && <line x1="1" x2="15" y1="5" y2="5" stroke={it.color} strokeWidth="1.5" strokeDasharray="3 2" />}
            {it.kind === 'dot' && <circle cx="8" cy="5" r="3.5" fill={it.color} />}
            {it.kind === 'rect' && <rect x="3" y="0" width="10" height="10" rx="2" fill={it.color} />}
          </svg>
          {it.label}
        </span>
      ))}
    </div>
  )
}

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const tw = 150
  const left = Math.min(Math.max(x - tw / 2, 0), width - tw)
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-md"
      style={{ left, width: tw }}
    >
      {children}
    </div>
  )
}

function TipRow({ color, label, value, kind = 'line' }: { color: string; label: string; value: string; kind?: 'line' | 'rect' }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="10" height="8" aria-hidden>
        {kind === 'line' ? <line x1="0" x2="10" y1="4" y2="4" stroke={color} strokeWidth="2" /> : <rect width="8" height="8" rx="1.5" fill={color} />}
      </svg>
      <span className="font-semibold text-slate-900">{value}</span>
      <span className="text-slate-500">{label}</span>
    </div>
  )
}

/** แบ่ง path เป็นช่วงต่อเนื่อง ข้ามจุดที่ไม่มีค่า */
function linePath(vals: (number | undefined)[], x: (i: number) => number, y: (v: number) => number) {
  let d = ''
  let pen = false
  vals.forEach((v, i) => {
    if (v === undefined) return void (pen = false)
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
  })
  return d
}

export function WeightChart({ days, goal }: { days: DaySummary[]; goal: number }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const vals = days.flatMap((d) => [d.morning, d.evening, d.avg7]).filter((v): v is number => v !== undefined)

  if (!vals.length) {
    return <div ref={ref} className="py-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูลน้ำหนักในช่วงนี้</div>
  }

  let lo = Math.min(...vals) - 0.5
  const hi = Math.max(...vals) + 0.5
  const showGoal = goal >= lo - 2 && goal <= hi
  if (showGoal) lo = Math.min(lo, goal - 0.3)
  const { ticks } = niceTicks(lo, hi)

  const n = days.length
  const iw = W - M.l - M.r
  const ih = H - M.t - M.b
  const x = (i: number) => M.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1))
  const y = (v: number) => M.t + ih - ((v - lo) / (hi - lo)) * ih
  const r = n > 60 ? 2.5 : 3.5

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left + M.l
    const i = n === 1 ? 0 : Math.round(((px - M.l) / iw) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  const hd = hover !== null ? days[hover] : null

  return (
    <div ref={ref} className="relative">
      <Legend
        items={[
          { label: 'เฉลี่ย 7 วัน', color: C.s1, kind: 'line' },
          { label: 'เช้า', color: C.s2, kind: 'dot' },
          { label: 'เย็น', color: C.s3, kind: 'dot' },
          ...(showGoal ? [{ label: `เป้าหมาย ${fmt1(goal)} กก.`, color: C.ref, kind: 'dash' as const }] : []),
        ]}
      />
      <div className="relative">
        <svg width={W} height={H} role="img" aria-label="กราฟน้ำหนักรายวัน" className="block touch-pan-y">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={C.axis}>{t % 1 ? t.toFixed(1) : t}</text>
            </g>
          ))}
          {xLabelIdx(n, W).map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill={C.axis}>
              {shortDate(days[i].date)}
            </text>
          ))}
          {showGoal && <line x1={M.l} x2={W - M.r} y1={y(goal)} y2={y(goal)} stroke={C.ref} strokeWidth="1.5" strokeDasharray="4 3" />}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} stroke={C.axis} strokeWidth="1" />}
          <path d={linePath(days.map((d) => d.avg7), x, y)} fill="none" stroke={C.s1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {days.map((d, i) =>
            d.evening !== undefined ? <circle key={`e${i}`} cx={x(i)} cy={y(d.evening)} r={r} fill={C.s3} stroke="#fff" strokeWidth="1.5" /> : null,
          )}
          {days.map((d, i) =>
            d.morning !== undefined ? <circle key={`m${i}`} cx={x(i)} cy={y(d.morning)} r={r} fill={C.s2} stroke="#fff" strokeWidth="1.5" /> : null,
          )}
          <rect
            x={M.l}
            y={M.t}
            width={iw}
            height={ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hd && (
          <Tooltip x={x(hover!)} width={W}>
            <div className="mb-0.5 text-slate-500">{shortDate(hd.date)}</div>
            <TipRow color={C.s1} label="เฉลี่ย 7 วัน" value={hd.avg7 !== undefined ? `${fmt1(hd.avg7)} กก.` : '–'} />
            <TipRow color={C.s2} label="เช้า" value={hd.morning !== undefined ? `${fmt1(hd.morning)} กก.` : '–'} />
            <TipRow color={C.s3} label="เย็น" value={hd.evening !== undefined ? `${fmt1(hd.evening)} กก.` : '–'} />
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export function CalorieChart({ days }: { days: DaySummary[] }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  if (!days.some((d) => d.logged)) {
    return <div ref={ref} className="py-10 text-center text-sm text-slate-400">ยังไม่มีบันทึกอาหารในช่วงนี้</div>
  }

  const n = days.length
  const iw = W - M.l - M.r
  const ih = H - M.t - M.b
  const max = Math.max(...days.map((d) => Math.max(d.kcal, d.target))) * 1.08
  const { ticks } = niceTicks(0, max, 4)
  const top = Math.max(max, ticks[ticks.length - 1])
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

  // เส้นเป้าหมายแบบขั้นบันได (เป้าปรับตามน้ำหนัก)
  const targetPath = days.map((d, i) => `${i ? 'L' : 'M'}${M.l + col * i},${y(d.target)}H${M.l + col * (i + 1)}`).join('')
  const anyOver = days.some((d) => d.logged && d.kcal > d.target)
  const hd = hover !== null ? days[hover] : null
  const today = todayStr()

  return (
    <div ref={ref} className="relative">
      <Legend
        items={[
          { label: 'ไม่เกินเป้า', color: C.s1, kind: 'rect' },
          ...(anyOver ? [{ label: 'เกินเป้า', color: C.critical, kind: 'rect' as const }] : []),
          { label: 'เป้าหมาย', color: C.ref, kind: 'dash' },
        ]}
      />
      <div className="relative">
        <svg width={W} height={H} role="img" aria-label="กราฟแคลอรี่รายวัน" className="block touch-pan-y">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={C.axis}>{fmtInt(t)}</text>
            </g>
          ))}
          {xLabelIdx(n, W).map((i) => (
            <text key={i} x={cx(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill={C.axis}>
              {shortDate(days[i].date)}
            </text>
          ))}
          {days.map((d, i) =>
            d.logged && d.kcal > 0 ? (
              <path
                key={d.date}
                d={bar(i, d.kcal)}
                fill={d.kcal > d.target ? C.critical : C.s1}
                opacity={(hover === null || hover === i ? 1 : 0.55) * (d.date === today ? 0.45 : 1)}
              />
            ) : null,
          )}
          <path d={targetPath} fill="none" stroke={C.ref} strokeWidth="1.5" strokeDasharray="4 3" />
          {days.map((d, i) => (
            <rect
              key={`h${d.date}`}
              x={M.l + col * i}
              y={M.t}
              width={col}
              height={ih}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>
        {hd && (
          <Tooltip x={cx(hover!)} width={W}>
            <div className="mb-0.5 text-slate-500">{shortDate(hd.date)}{hd.date === today && ' (วันนี้ ยังไม่ครบ)'}</div>
            {hd.logged ? (
              <>
                <TipRow kind="rect" color={hd.kcal > hd.target ? C.critical : C.s1} label="กิน" value={`${fmtInt(hd.kcal)} kcal`} />
                <TipRow color={C.ref} label="เป้า" value={`${fmtInt(hd.target)} kcal`} />
                <div className={hd.kcal > hd.target ? 'text-red-600' : 'text-emerald-700'}>
                  {hd.kcal > hd.target ? `▲ เกิน ${fmtInt(hd.kcal - hd.target)}` : `✓ เหลือ ${fmtInt(hd.target - hd.kcal)}`}
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
