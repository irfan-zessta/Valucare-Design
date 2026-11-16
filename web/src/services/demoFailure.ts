// ===========================================================================
// Demo-only "arm the next save to fail" switch. Lets a presenter show the
// save-failure → retry recovery path deterministically: arm it, perform a save
// (it fails once and disarms), then retry (it succeeds). Clearly labelled in the
// UI as a demo control; no effect on real behaviour otherwise.
// ===========================================================================
let armed = false
const listeners = new Set<() => void>()

export function isFailureArmed(): boolean {
  return armed
}

export function armNextSaveFailure(value = true): void {
  armed = value
  listeners.forEach((l) => l())
}

/** Returns true (and disarms) if the next save was armed to fail. */
export function consumeFailure(): boolean {
  if (!armed) return false
  armed = false
  listeners.forEach((l) => l())
  return true
}

export function subscribeFailure(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
