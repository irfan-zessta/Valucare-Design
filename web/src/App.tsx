import { Button, Link, TextInput, Tile, Tag } from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'

// Phase 1 theme preview — verifies the brand-red Carbon theme (primary buttons,
// links, focus, selection) while keeping Carbon's semantic status colours and
// IBM Plex Sans. Replaced by the real shell + journey in later phases.
export default function App() {
  return (
    <main style={{ maxWidth: '44rem', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <Tag type="red" size="sm">
        Brand theme preview
      </Tag>
      <h1 className="cds--type-productive-heading-05" style={{ margin: '1rem 0 0.25rem' }}>
        HMS4 Corporate New Business
      </h1>
      <p
        className="cds--type-body-long-01"
        style={{ marginBottom: '1.5rem', color: 'var(--cds-text-secondary)' }}
      >
        Carbon g10 theme with brand red #CB0A2F, IBM Plex Sans, Gray 10 background and white
        surfaces. Red is used only for actions and selection.
      </p>

      <Tile style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <Button renderIcon={ArrowRight}>Primary action</Button>
          <Button kind="secondary">Secondary</Button>
          <Button kind="tertiary">Tertiary</Button>
        </div>
        <p className="cds--type-body-long-01" style={{ marginBottom: '1rem' }}>
          This is a <Link href="#demo">brand-red link</Link> with an accessible underline.
        </p>
        <TextInput
          id="demo-field"
          labelText="Focusable field — tab here to see the focus ring"
          placeholder="Click or tab into this field"
        />
      </Tile>

      <Tile>
        <p className="cds--type-heading-compact-01" style={{ marginBottom: '0.5rem' }}>
          Errors stay distinct from the brand
        </p>
        <p
          className="cds--type-body-long-01"
          style={{ marginBottom: '1rem', color: 'var(--cds-text-secondary)' }}
        >
          Carbon's semantic danger colour, icon and wording are kept separate so brand red is
          never read as an error.
        </p>
        <Button kind="danger">Danger action</Button>
      </Tile>
    </main>
  )
}
