// ===========================================================================
// Access guards + the shared "no access" screen.
//
// Permission is not enforced by hiding links alone — a direct URL to a screen
// or case the active persona may not use lands here, with a plain explanation
// and a route back to the person's own worklist (never a silent redirect into
// an unrelated case).
// ===========================================================================
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Result } from 'antd'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { roleLabel } from '../../domain/access'
import { roleHomePath } from '../../domain/demoRoster'

export function AccessDenied({ title, detail }: { title: string; detail: ReactNode }) {
  const { role } = useActiveUser()
  const navigate = useNavigate()
  return (
    <div className="app-page">
      <Result
        status="403"
        title={title}
        subTitle={detail}
        extra={
          <Button type="primary" onClick={() => navigate(roleHomePath(role))}>
            Go to my worklist
          </Button>
        }
      />
    </div>
  )
}

/** Gate a top-level department screen by the active role's screen access. */
export function RequireScreen({ screen, children }: { screen: string; children: ReactNode }) {
  const { role, canSeeScreen } = useActiveUser()
  if (canSeeScreen(screen)) return <>{children}</>
  return (
    <AccessDenied
      title="This workspace isn’t part of your role"
      detail={`The ${roleLabel(role)} role doesn’t use this screen. Here is your own worklist instead.`}
    />
  )
}
