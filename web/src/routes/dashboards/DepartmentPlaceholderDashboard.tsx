// ===========================================================================
// Department dashboard for modules not yet connected in this React build
// (Actuarial, MDA, Billing & Collections, Accounts, Provider Networks, Claims,
// CCD). It reuses the SAME shared DepartmentDashboard so the layout and
// behaviour match Sales exactly — but with the department's OWN (currently
// empty) records. Per the brief we do not reuse Sales records or invent data:
// these honestly show the "No records yet" state, and the department's real
// primary action is disabled until the module is migrated.
// ===========================================================================
import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Alert } from 'antd'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { DepartmentDashboard, type DashboardConfig } from '../../components/dashboard/DepartmentDashboard'

type EmptyRow = Record<string, unknown>

interface DeptMeta {
  title: string
  supportingText: string
  primaryActionLabel: string
}

// Real department names + their real-world primary action (disabled until built).
const DEPTS: Record<string, DeptMeta> = {
  actuarial: {
    title: 'Actuarial',
    supportingText: 'Review rate requests and issue rate sheets.',
    primaryActionLabel: 'Open rate requests',
  },
  mda: {
    title: 'MDA',
    supportingText: 'Administer member data imports and corrections.',
    primaryActionLabel: 'New member data import',
  },
  billing: {
    title: 'Billing & Collections',
    supportingText: 'Prepare statements of account and manage collections.',
    primaryActionLabel: 'Create invoice request',
  },
  accounts: {
    title: 'Accounts',
    supportingText: 'Create and approve accounts from accepted offers.',
    primaryActionLabel: 'Open account queue',
  },
  'provider-networks': {
    title: 'Provider Networks',
    supportingText: 'Manage the provider directory, accreditation and rates.',
    primaryActionLabel: 'Add provider',
  },
  claims: {
    title: 'Claims',
    supportingText: 'Process and adjudicate claims.',
    primaryActionLabel: 'New claim',
  },
  ccd: {
    title: 'CCD',
    supportingText: 'Handle customer care requests and inquiries.',
    primaryActionLabel: 'New request',
  },
}

export default function DepartmentPlaceholderDashboard() {
  const { deptId = '' } = useParams()
  const meta = DEPTS[deptId]
  const { loading, error, retry } = useInitialLoad()

  const config = useMemo<DashboardConfig<EmptyRow> | null>(() => {
    if (!meta) return null
    return {
      deptId,
      title: meta.title,
      supportingText: meta.supportingText,
      primaryAction: {
        label: meta.primaryActionLabel,
        disabled: true,
        disabledReason: 'Not available in this build yet',
      },
      note: (
        <Alert
          type="info"
          showIcon
          title="Records not connected yet"
          description="This department’s records live in the current ValuCare application and aren’t wired into this redesigned shell yet. The dashboard below is the shared pattern — statistics, work list and actions will populate as the module is migrated."
        />
      ),
      rowId: () => '',
      isCompleted: () => false,
      needsMyAction: () => false,
      searchText: () => '',
      filters: [],
      matchesFilters: () => true,
      inProgressColumns: [],
      completedColumns: [],
    }
  }, [deptId, meta])

  if (!meta || !config) return <Navigate to="/" replace />

  return <DepartmentDashboard<EmptyRow> config={config} rows={[]} loading={loading} error={error} onRetry={retry} />
}
