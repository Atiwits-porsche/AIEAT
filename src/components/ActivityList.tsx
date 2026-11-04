import type { ActivityLog } from '../lib/db'
import { db } from '../lib/db'
import { typeOf } from '../lib/exercise'
import { fmtInt } from '../lib/calc'

export default function ActivityList({ items }: { items: ActivityLog[] }) {
  if (!items.length) return null
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-2 py-2">
          <span className="text-xl">{typeOf(a.type)?.icon ?? '🏃'}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{a.name}</div>
            <div className="text-xs text-slate-500">{a.minutes} นาที · {fmtInt(a.kcal)} kcal</div>
          </div>
          <button onClick={() => db.activities.delete(a.id!)} className="px-1 text-lg text-slate-300 hover:text-red-500" aria-label={`ลบ ${a.name}`}>×</button>
        </li>
      ))}
    </ul>
  )
}
