export default function Ring({ value, max, size = 132 }: { value: number; max: number; size?: number }) {
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? value / max : 0
  const over = pct > 1
  const shown = Math.min(pct, 1)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={over ? '#ef4444' : pct > 0.9 ? '#f59e0b' : '#10b981'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - shown)}
        style={{ transition: 'stroke-dashoffset .4s ease' }}
      />
    </svg>
  )
}
