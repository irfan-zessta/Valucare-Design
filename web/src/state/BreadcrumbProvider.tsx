// ===========================================================================
// Breadcrumb context — lets a routed page publish its breadcrumb trail so the
// application header can render it (home icon › … › current page). Pages set
// their trail via <PageHeader breadcrumb={…}/>; when a page sets nothing, the
// header falls back to a trail derived from the navigation config.
// ===========================================================================
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export interface Crumb {
  title: ReactNode
  /** Present when this crumb should link somewhere (never on the current page). */
  to?: string
}

interface BreadcrumbContextValue {
  items: Crumb[] | null
  setItems: (items: Crumb[] | null) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Crumb[] | null>(null)
  const value = useMemo(() => ({ items, setItems }), [items])
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

/** Read the current page trail (null when the page hasn't set one). */
export function useBreadcrumbItems(): Crumb[] | null {
  return useContext(BreadcrumbContext)?.items ?? null
}

/** Publish a page's breadcrumb trail for the lifetime of the component. */
export function useSetBreadcrumb(items: Crumb[] | undefined) {
  const ctx = useContext(BreadcrumbContext)
  // Serialize the link targets so the effect only re-runs on a real change.
  const key = items ? items.map((c) => c.to ?? '').join('>') + '|' + items.length : ''
  useEffect(() => {
    if (!ctx) return
    ctx.setItems(items ?? null)
    return () => ctx.setItems(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, key])
}
