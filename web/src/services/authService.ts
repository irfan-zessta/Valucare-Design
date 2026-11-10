// ===========================================================================
// Simulated authentication service — NOT PRODUCTION SECURITY.
//
// This is a stand-in for a real identity provider so the demo can show a
// sign-in / sign-out flow. It validates a single hard-coded fictional account
// entirely in the browser; there is no server, no password hashing, no token
// issuance, and no session verification. Do NOT use any of this for real
// authentication.
//
// Replaceable by design: every caller goes through `signIn` and the exported
// types. To wire a real backend, re-implement `signIn` (and the session shape
// in AuthProvider) against your API — the UI does not need to change.
// ===========================================================================
import type { ServiceResult } from '../domain/types'

/** The one fictional demo identity. Shown on the login page as a hint. */
export const DEMO_CREDENTIALS = {
  email: 'demo@valucare.example',
  password: 'Demo@1234',
} as const

/** The signed-in user the rest of the app sees. */
export interface AuthedUser {
  email: string
  name: string
  workspace: string
}

/** The demo user granted to anyone who signs in with the demo credentials. */
const DEMO_USER: AuthedUser = {
  email: DEMO_CREDENTIALS.email,
  name: 'Demo Admin',
  workspace: 'Demo workspace',
}

/**
 * Validate credentials. Simulated: compares against the fixed demo account and
 * resolves after a tiny delay so the UI's pending state is visible. A real
 * implementation would call an identity API here and return the same shape.
 */
export async function signIn(email: string, password: string): Promise<ServiceResult<AuthedUser>> {
  await new Promise((r) => setTimeout(r, 250))

  const emailOk = email.trim().toLowerCase() === DEMO_CREDENTIALS.email
  const passwordOk = password === DEMO_CREDENTIALS.password

  if (emailOk && passwordOk) {
    return { ok: true, data: DEMO_USER }
  }
  return {
    ok: false,
    error: {
      code: 'invalid_credentials',
      message: 'That email and password don’t match the demo account. Use “Use demo credentials” to fill them in.',
    },
  }
}
