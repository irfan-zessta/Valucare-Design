// Consistent formatting helpers so currency, dates and numbers look the same
// everywhere in the journey.

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatRelative(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  const day = 86_400_000
  if (diffMs < day) return 'Today'
  const days = Math.floor(diffMs / day)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(iso)
}

export function formatPeso(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n)
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-PH').format(n)
}
