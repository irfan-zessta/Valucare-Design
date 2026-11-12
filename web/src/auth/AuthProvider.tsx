// ===========================================================================
// Auth session state (SIMULATED — see services/authService.ts).
//
// Holds the current signed-in user and exposes sign-in / sign-out. The session
// is kept in sessionStorage: it survives a page refresh (so a deep link +
// refresh keeps you signed in) but is cleared on sign-out and does not persist
// a closed browser. Business data (cases, drafts) lives separately in
// localStorage, so signing out never discards saved work.
// ===========================================================================
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { signIn as serviceSignIn, type AuthedUser } from '../services/authService'
import type { ServiceResult } from '../domain/types'

const SESSION_KEY = 'valucare-hms:session'

function readSession(): AuthedUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthedUser
    return parsed && typeof parsed.email === 'string' ? parsed : null
  } catch {
    return null
  }
}

interface AuthContextValue {
  user: AuthedUser | null
  isAuthenticated: boolean
  /** Attempt sign-in; on success the session is stored and state updates. */
  signIn: (email: string, password: string) => Promise<ServiceResult<AuthedUser>>
  /** End the simulated session. Does not touch saved business data. */
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(() => readSession())

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await serviceSignIn(email, password)
    if (result.ok) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(result.data))
      } catch {
        // storage unavailable — in-memory session still works for this tab
      }
      setUser(result.data)
    }
    return result
  }, [])

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, signIn, signOut }),
    [user, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
