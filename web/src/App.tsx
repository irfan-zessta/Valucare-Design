import { Button, Tag, Tile } from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'

// Phase 0 smoke test only — proves the @carbon/react + Sass toolchain renders.
// The real application shell, navigation and the five work areas arrive in the
// next phases.
export default function App() {
  return (
    <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <Tag type="blue" size="sm">
        Carbon build foundation
      </Tag>
      <h1 className="cds--type-productive-heading-05" style={{ margin: '1rem 0 0.5rem' }}>
        HMS4 Corporate New Business
      </h1>
      <p className="cds--type-body-long-01" style={{ marginBottom: '1.5rem' }}>
        React + @carbon/react build is running. Theme (colours and typography) is
        pending confirmation; this is Carbon's default light theme as a baseline.
      </p>
      <Tile>
        <p className="cds--type-body-long-01" style={{ marginBottom: '1rem' }}>
          Toolchain check: Carbon components, icons and styles are wired through a
          single Sass entry.
        </p>
        <Button renderIcon={ArrowRight}>Primary action</Button>
      </Tile>
    </main>
  )
}
