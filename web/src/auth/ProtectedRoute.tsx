// ===========================================================================
// Route guard. Any route nested under this element requires a signed-in
// (simulated) session. When there is none, we redirect to /login and remember
// where the user was headed so sign-in can return them there. `replace` keeps
// the protected URL out of history, so the browser Back button cannot reveal a
// protected screen after sign-out without signing in again.
// ===========================================================================
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <Outlet />
}
