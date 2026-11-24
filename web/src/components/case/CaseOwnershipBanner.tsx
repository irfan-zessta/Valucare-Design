// ===========================================================================
// Case ownership banner — shown at the top of the case workspace so, on every
// screen, the answer to "who owns the next step?" is obvious.
//
// It states the current status, the responsible team, and whether the next
// action belongs to the active persona. When the next step belongs to another
// team, it offers a presenter shortcut — "Continue as <team>" — that switches
// to that demo person and stays on the SAME case (it never approves or
// advances anything by itself).
// ===========================================================================
import { App, Button, Tag } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import type { Case } from '../../domain/types'
import { meaningfulStatus, nextAction } from '../../domain/progress'
import { roleDepartment } from '../../domain/caseAccess'
import { userForDepartment } from '../../domain/caseHistory'
import { useActiveUser } from '../../state/ActiveUserProvider'

export function CaseOwnershipBanner({ c }: { c: Case }) {
  const { user, role, setUserId } = useActiveUser()
  const { message } = App.useApp()

  const na = nextAction(c)
  const responsible = na.department
  const mineDept = roleDepartment(role)
  const isMine = !c.isCompleted && responsible === mineDept

  // When the next step is another team's, offer to continue as that person.
  const target = isMine || c.isCompleted ? undefined : userForDepartment(responsible, user.id)

  const onContinue = () => {
    if (!target) return
    setUserId(target.id)
    message.success(`Now viewing as ${target.department}`)
  }

  return (
    <div className={`case-own${isMine ? ' case-own--mine' : ''}`}>
      <div className="case-own__main">
        <span className="case-own__status">{meaningfulStatus(c)}</span>
        <span className="case-own__sep" aria-hidden>·</span>
        {c.isCompleted ? (
          <span className="case-own__resp">Journey complete</span>
        ) : isMine ? (
          <span className="case-own__resp">
            Your action — <strong>{na.waiting ? 'this step is yours to complete' : na.label}</strong>
          </span>
        ) : (
          <span className="case-own__resp">
            Responsible now: <strong>{responsible}</strong>
          </span>
        )}
      </div>
      <div className="case-own__side">
        {isMine ? (
          <Tag className="case-own__tag">Your task</Tag>
        ) : target ? (
          <Button size="small" onClick={onContinue} icon={<ArrowRightOutlined />}>
            Continue as {target.department}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
