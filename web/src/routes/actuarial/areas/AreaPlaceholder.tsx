// ===========================================================================
// Placeholder for Actuarial work areas delivered in a later phase. Honest about
// what's not built yet — never an invented or blank screen — and keeps the
// request navigable so completed areas stay reachable.
// ===========================================================================
import { Button, Result } from 'antd'
import { FormSection } from '../../../components/ui/FormSection'
import { ACTUARIAL_AREA_LABELS, type ActuarialAreaId } from '../../../domain/types'

export function AreaPlaceholder({ area, onBack }: { area: ActuarialAreaId; onBack: () => void }) {
  return (
    <FormSection wide title={ACTUARIAL_AREA_LABELS[area]}>
      <Result
        status="info"
        title={`${ACTUARIAL_AREA_LABELS[area]} is part of a later phase`}
        subTitle="This work area is being built next. Review Request is complete and fully usable now."
        extra={<Button type="primary" onClick={onBack}>Back to Review Request</Button>}
      />
    </FormSection>
  )
}
