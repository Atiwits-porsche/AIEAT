import { zoneOf, type Scale, type Tone } from '../lib/body'

export const TONE: Record<Tone, { bar: string; chip: string; icon: string }> = {
  low: { bar: '#7cb3ec', chip: 'bg-sky-50 text-sky-800', icon: '▽' },
  good: { bar: '#10b981', chip: 'bg-emerald-50 text-emerald-800', icon: '✓' },
  warn: { bar: '#f2b33d', chip: 'bg-amber-50 text-amber-800', icon: '!' },
  bad: { bar: '#e34948', chip: 'bg-red-50 text-red-700', icon: '!!' },
  neutral: { bar: '#cbd5e1', chip: 'bg-slate-100 text-slate-700', icon: '•' },
}

/** แถบช่วงค่าพร้อมตัวชี้ แบบเดียวกับใบผลเครื่องวัด */
export default function RangeBar({ label, value, unit, scale, digits = 1, ticks, sub }: {
  label: string
  value: number
  unit: string
  scale: Scale
  digits?: number
  ticks?: number[]
  sub?: string
}) {
  const { min, max } = scale
  const pos = (v: number) => ((Math.min(Math.max(v, min), max) - min) / (max - min)) * 100
  const z = zoneOf(scale, value)
  let start = min
  const segs = scale.zones.map((zone) => {
    const s = { ...zone, from: start, end: Math.min(zone.to, max) }
    start = s.end
    return s
  }).filter((s) => s.end > s.from)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-900">{value.toFixed(digits)}<span className="ml-0.5 text-xs font-normal text-slate-500">{unit}</span></span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[z.tone].chip}`}>
            <span aria-hidden className="mr-0.5">{TONE[z.tone].icon}</span>{z.label}
          </span>
        </span>
      </div>
      <div className="relative mt-3">
        {/* ตัวชี้ค่า */}
        <div className="absolute -top-2 z-10 -translate-x-1/2" style={{ left: `${pos(value)}%` }} aria-hidden>
          <div className="h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-slate-800" />
        </div>
        <div className="flex h-2.5 gap-[2px]">
          {segs.map((s, i) => (
            <div
              key={i}
              className={`${i === 0 ? 'rounded-l-full' : ''} ${i === segs.length - 1 ? 'rounded-r-full' : ''}`}
              style={{ width: `${((s.end - s.from) / (max - min)) * 100}%`, background: TONE[s.tone].bar, opacity: s === segs.find((x) => x.label === z.label) ? 1 : 0.45 }}
            />
          ))}
        </div>
        <div className="relative mt-1 h-3.5 text-[10px] text-slate-400">
          {(ticks ?? segs.slice(0, -1).map((s) => s.end)).map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>{t}</span>
          ))}
        </div>
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}
