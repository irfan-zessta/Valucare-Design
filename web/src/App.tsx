import { ConfigProvider, App as AntApp } from 'antd'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { theme } from './theme'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { CaseProvider, useCases } from './state/CaseProvider'
import { UiPrefsProvider } from './state/UiPrefsProvider'
import { UnsavedChangesProvider } from './state/UnsavedChangesProvider'
import { AppShell } from './components/shell/AppShell'
import Login from './routes/Login'
import Home from './routes/Home'
import ComingSoon from './routes/ComingSoon'
import NewBusinessList from './routes/NewBusinessList'
import CreateCase from './routes/CreateCase'
import CaseWorkspace from './routes/CaseWorkspace'

// /cases/:caseId with no work area → resume the case's latest saved work area.
function ResumeCase() {
  const { caseId = '' } = useParams()
  const { getCase } = useCases()
  const c = getCase(caseId)
  if (!c) return <Navigate to="/sales/corporate-new-business" replace />
  return <Navigate to={`/cases/${c.id}/${c.currentWorkArea}`} replace />
}

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <UiPrefsProvider>
              <CaseProvider>
                <UnsavedChangesProvider>
                  <Routes>
                    {/* Public: the login screen lives outside the application shell. */}
                    <Route path="/login" element={<Login />} />

                    {/* Everything else requires a (simulated) session and renders in the shell. */}
                    <Route element={<ProtectedRoute />}>
                      <Route element={<AppShell />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/sales/corporate-new-business" element={<NewBusinessList />} />
                        <Route path="/sales/corporate-new-business/new" element={<CreateCase />} />
                        <Route path="/cases/:caseId" element={<ResumeCase />} />
                        <Route path="/cases/:caseId/:workArea" element={<CaseWorkspace />} />
                        <Route path="/coming-soon/:slug" element={<ComingSoon />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Route>
                    </Route>
                  </Routes>
                </UnsavedChangesProvider>
              </CaseProvider>
            </UiPrefsProvider>
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}
