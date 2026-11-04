const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayStr() {
  return toDateStr(new Date())
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  return toDateStr(new Date(y, m - 1, d + n))
}

export function formatThaiDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })
}
