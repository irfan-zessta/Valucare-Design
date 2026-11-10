import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { CaseProvider, useCases } from './state/CaseProvider'
import { AppShell } from './components/AppShell'
import NewBusinessList from './routes/NewBusinessList'
import CreateCase from './routes/CreateCase'
import CaseWorkspace from './routes/CaseWorkspace'

// /cases/:caseId with no work area → resume the case's latest saved work area.
function ResumeCase() {
  const { caseId = '' } = useParams()
  const { getCase } = useCases()
  const c = getCase(caseId)
  if (!c) return <Navigate to="/" replace />
  return <Navigate to={`/cases/${c.id}/${c.currentWorkArea}`} replace />
}

export default function App() {
  return (
    <CaseProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<NewBusinessList />} />
            <Route path="/new" element={<CreateCase />} />
            <Route path="/cases/:caseId" element={<ResumeCase />} />
            <Route path="/cases/:caseId/:workArea" element={<CaseWorkspace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </CaseProvider>
  )
}
