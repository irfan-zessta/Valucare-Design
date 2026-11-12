// ===========================================================================
// Brand avatar — Ant Design Avatar showing the user's initials in brand red.
// ===========================================================================
import { Avatar as AntAvatar } from 'antd'
import { BRAND_RED } from '../../theme'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <AntAvatar size={size} style={{ backgroundColor: BRAND_RED, color: '#fff', fontWeight: 600, flex: 'none' }}>
      {initialsOf(name)}
    </AntAvatar>
  )
}
