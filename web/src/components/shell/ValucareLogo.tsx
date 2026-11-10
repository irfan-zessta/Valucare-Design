// ===========================================================================
// ValuCare brand logo — the "VC" cross mark + wordmark used in the header and
// on the login screen. The mark is the brand PNG asset so it stays pixel-exact
// to the supplied artwork; it inherits its box size from `size`.
// `withWordmark={false}` renders just the mark (used in the collapsed sidebar /
// tight spaces).
// ===========================================================================
import logoMark from '../../assets/valucare-logo.png'

export function ValucareLogo({
  withWordmark = true,
  size = 24,
}: {
  withWordmark?: boolean
  size?: number
}) {
  return (
    <span className="app-logo" aria-hidden="true">
      <img
        className="app-logo__mark"
        src={logoMark}
        alt=""
        width={size}
        height={size}
      />
      {withWordmark && <span className="app-logo__wordmark">ValuCare</span>}
    </span>
  )
}
