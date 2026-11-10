// Stable, human-readable IDs. Case IDs are assigned once and never change for
// the life of the journey. A monotonic counter is persisted alongside the store
// so a double-click or refresh can't mint the same number twice.
const YEAR = 2026

export function makeCaseId(seq: number): string {
  return `NB-${YEAR}-${String(seq).padStart(4, '0')}`
}

export function makeRequestRef(seq: number): string {
  return `RR-${YEAR}-${String(seq).padStart(4, '0')}`
}

export function makeAccountRef(seq: number): string {
  return `ACC-${YEAR}-${String(seq).padStart(4, '0')}`
}

let localCounter = 0
/** Opaque unique id for sub-entities (documents, proposals, plan codes). */
export function uid(prefix: string): string {
  localCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${localCounter}`
}
