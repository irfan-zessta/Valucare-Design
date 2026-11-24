import { ConfigProvider, App as AntApp } from 'antd'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { theme } from './theme'
import { AuthProvider } from './auth/AuthProvider'
import { ActiveUserProvider } from './state/ActiveUserProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { CaseProvider, useCases } from './state/CaseProvider'
import { EnquiryProvider } from './state/EnquiryProvider'
import { LeadProvider } from './state/LeadProvider'
import { RenewalProvider } from './state/RenewalProvider'
import { UiPrefsProvider } from './state/UiPrefsProvider'
import { MentionsProvider } from './state/MentionsProvider'
import { UnsavedChangesProvider } from './state/UnsavedChangesProvider'
import { BreadcrumbProvider } from './state/BreadcrumbProvider'
import { AppShell } from './components/shell/AppShell'
import { RequireScreen } from './components/access/AccessGuards'
import Login from './routes/Login'
import Home from './routes/Home'
import ComingSoon from './routes/ComingSoon'
import SalesDashboard from './routes/dashboards/SalesDashboard'
import DepartmentPlaceholderDashboard from './routes/dashboards/DepartmentPlaceholderDashboard'
import CreateCase from './routes/CreateCase'
import CaseWorkspace from './routes/CaseWorkspace'
import AccountsDirectory from './routes/AccountsDirectory'
import RenewalsDashboard from './routes/renewals/RenewalsDashboard'
import RenewalWorkspace from './routes/renewals/RenewalWorkspace'
import NewEnquiry from './routes/enquiries/NewEnquiry'
import EnquiryDetail from './routes/enquiries/EnquiryDetail'
import LeadDetail from './routes/leads/LeadDetail'

// /cases/:caseId with no work area → resume the case's latest saved work area.
function ResumeCase() {
  const { caseId = '' } = useParams()
  const { getCase } = useCases()
  const c = getCase(caseId)
  if (!c) return <Navigate to="/sales" replace />
  return <Navigate to={`/cases/${c.id}/${c.currentWorkArea}`} replace />
}

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <ActiveUserProvider>
            <UiPrefsProvider>
              <CaseProvider>
                <RenewalProvider>
                <EnquiryProvider>
                <LeadProvider>
                <UnsavedChangesProvider>
                <MentionsProvider>
                <BreadcrumbProvider>
                  <Routes>
                    {/* Public: the login screen lives outside the application shell. */}
                    <Route path="/login" element={<Login />} />

                    {/* Everything else requires a (simulated) session and renders in the shell. */}
                    <Route element={<ProtectedRoute />}>
                      <Route element={<AppShell />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/sales" element={<RequireScreen screen="sales"><SalesDashboard /></RequireScreen>} />
                        {/* Accounts directory — the master register of created accounts. */}
                        <Route path="/accounts" element={<RequireScreen screen="accounts"><AccountsDirectory /></RequireScreen>} />
                        {/* Corporate Renewal — dashboard + per-renewal case workspace. */}
                        <Route path="/sales/renewals" element={<RenewalsDashboard />} />
                        <Route path="/sales/renewals/:id" element={<RenewalWorkspace />} />
                        <Route path="/sales/renewals/:id/:phase" element={<RenewalWorkspace />} />
                        {/* Corporate New Business worklist — the "New Business" menu item
                            (the same records the Sales dashboard shows). */}
                        <Route path="/sales/corporate-new-business" element={<RequireScreen screen="sales"><SalesDashboard /></RequireScreen>} />
                        <Route path="/sales/corporate-new-business/new" element={<CreateCase />} />
                        {/* Enquiries now live in the Sales dashboard's New Enquiries tab;
                            the old standalone list redirects there (tab is preserved). */}
                        <Route path="/sales/enquiries" element={<Navigate to="/sales" replace />} />
                        <Route path="/sales/enquiries/new" element={<NewEnquiry />} />
                        <Route path="/sales/enquiries/:enquiryId" element={<EnquiryDetail />} />
                        {/* Leads — the qualified stage between an enquiry and a franchise. */}
                        <Route path="/sales/leads/:leadId" element={<LeadDetail />} />
                        <Route path="/cases/:caseId" element={<ResumeCase />} />
                        <Route path="/cases/:caseId/:workArea" element={<CaseWorkspace />} />
                        <Route path="/coming-soon/:slug" element={<ComingSoon />} />
                        {/* Per-department dashboards (Actuarial, MDA, Billing, …). */}
                        <Route path="/:deptId" element={<DepartmentPlaceholderDashboard />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Route>
                    </Route>
                  </Routes>
                </BreadcrumbProvider>
                </MentionsProvider>
                </UnsavedChangesProvider>
                </LeadProvider>
                </EnquiryProvider>
                </RenewalProvider>
              </CaseProvider>
            </UiPrefsProvider>
            </ActiveUserProvider>
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}
