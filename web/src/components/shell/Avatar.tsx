// ===========================================================================
// Avatar — a minimal initials chip: a quiet neutral circle with the user's
// initials. Kept flat and low-contrast on purpose so the header and persona
// switcher read calmly; it sits well on white and on the tinted selected row.
// ===========================================================================
import { Avatar as AntAvatar } from 'antd'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <AntAvatar
      size={size}
      style={{
        backgroundColor: '#f0f1f3',
        color: '#4b4b4b',
        fontWeight: 600,
        fontSize: Math.round(size * 0.4),
        flex: 'none',
      }}
    >
      {initialsOf(name)}
    </AntAvatar>
  )
}
