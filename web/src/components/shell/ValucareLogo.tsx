// ===========================================================================
// ValuCare brand logo — a restrained mark + wordmark used in the header and on
// the login screen. The mark is a rounded square in the brand red with a white
// care "cross", drawn as inline SVG so it inherits crisp rendering and the
// brand colour token. `withWordmark={false}` renders just the mark (used in the
// collapsed sidebar / tight spaces).
// ===========================================================================

export function ValucareLogo({
  withWordmark = true,
  size = 24,
}: {
  withWordmark?: boolean
  size?: number
}) {
  return (
    <span className="app-logo" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 32 32" role="img" focusable="false">
        <rect width="32" height="32" rx="7" fill="#CB0A2F" />
        <path
          d="M16 7.5c-.7 0-1.3.6-1.3 1.3v4.4H10.3c-.7 0-1.3.6-1.3 1.3v3.4c0 .7.6 1.3 1.3 1.3h4.4v4.4c0 .7.6 1.3 1.3 1.3h3.4c.7 0 1.3-.6 1.3-1.3V19.2h4.4c.7 0 1.3-.6 1.3-1.3v-3.4c0-.7-.6-1.3-1.3-1.3h-4.4V8.8c0-.7-.6-1.3-1.3-1.3H16z"
          fill="#ffffff"
        />
      </svg>
      {withWordmark && <span className="app-logo__wordmark">ValuCare</span>}
    </span>
  )
}
