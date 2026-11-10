import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Header, HeaderName, SideNav, SideNavItems, SideNavLink } from '@carbon/react'
import { useCases } from '../state/CaseProvider'
import { WORK_AREA_ORDER, WORK_AREA_LABELS } from '../domain/types'
import { workAreaState } from '../domain/progress'

const STATE_HINT: Record<string, string> = {
  done: 'Done',
  current: 'Now',
  todo: 'To do',
}

/** Parses /cases/:caseId/:workArea out of the current path, if present. */
function useCaseRoute() {
  const { pathname } = useLocation()
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/([^/]+))?/)
  return m ? { caseId: m[1], workArea: m[2] } : null
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const route = useCaseRoute()
  const { getCase } = useCases()
  const activeCase = route ? getCase(route.caseId) : undefined
  const onNewBusiness = pathname === '/' || pathname === '/new'

  return (
    <>
      <Header aria-label="Valucare HMS4 Corporate New Business">
        <HeaderName as={Link} to="/" prefix="Valucare">
          Corporate New Business
        </HeaderName>
      </Header>

      <SideNav aria-label="Primary navigation" isFixedNav expanded isChildOfHeader={false}>
        <SideNavItems>
          <li className="app-sidenav__label cds--type-label-01">Sales</li>
          <SideNavLink as={Link} to="/" isActive={onNewBusiness}>
            New Business
          </SideNavLink>

          {activeCase && (
            <>
              <li className="app-sidenav__label cds--type-label-01">Case · {activeCase.id}</li>
              {WORK_AREA_ORDER.map((wa) => {
                const state = workAreaState(activeCase, wa)
                return (
                  <SideNavLink
                    key={wa}
                    as={Link}
                    to={`/cases/${activeCase.id}/${wa}`}
                    isActive={route?.workArea === wa}
                  >
                    <span style={{ display: 'flex', inlineSize: '100%' }}>
                      {WORK_AREA_LABELS[wa]}
                      <span className="app-nav-state cds--type-label-01">{STATE_HINT[state]}</span>
                    </span>
                  </SideNavLink>
                )
              })}
            </>
          )}
        </SideNavItems>
      </SideNav>

      <main className="app-main">
        <div className="app-page">{children}</div>
      </main>
    </>
  )
}
