const DAY_MS = 86400000

export function parseISODate(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

export function getToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
}

export function toISODate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export function daysBetween(start, end) {
  const a = parseISODate(start)
  const b = end instanceof Date ? end : parseISODate(end)
  if (!a || !b) return null
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS)
}

export function daysOpen(dateReceivedIso) {
  return daysBetween(dateReceivedIso, getToday()) ?? 0
}

export function formatDisplayDate(iso) {
  if (!iso) return '—'
  const d = parseISODate(iso)
  if (!d) return iso
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function monthKey(iso) {
  const d = parseISODate(iso)
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}
