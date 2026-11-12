// ===========================================================================
// FormActions — a deliberate action row for a form panel.
//   - separated from the fields above by a subtle top border;
//   - one primary button plus any aligned secondary actions (passed as children);
//   - optional short supporting text explaining what the primary action does.
// Designed to sit as the last child inside a <FormSection>.
// ===========================================================================
import type { ReactNode } from 'react'

export function FormActions({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-form-actions">
      <div className="app-form-actions__buttons">{children}</div>
      {note && <div className="app-form-actions__note">{note}</div>}
    </div>
  )
}
