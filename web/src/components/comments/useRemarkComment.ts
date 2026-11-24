// ===========================================================================
// useRemarkComment — the shared bridge from a "remarks" field to the case
// Comments thread. Call the returned function when a remark is committed (on
// approve / return / generate / save) to post it as a comment on the case and
// notify anyone "@Name" mentioned. Returns the tagged people so the caller can
// surface "— @X notified" in its own success toast.
// ===========================================================================
import { useCallback } from 'react'
import { useComments } from '../../state/CommentsProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { extractMentions } from './mentionUtils'

export interface RemarkTarget {
  caseId: string
  caseName: string
  /** Optional prefix so the thread reads clearly, e.g. "Approval remarks". */
  label?: string
}

export function useRemarkComment() {
  const { add } = useComments()
  const { user } = useActiveUser()

  return useCallback(
    (target: RemarkTarget, remark: string): { id: string; name: string }[] => {
      const body = remark.trim()
      if (!body) return []
      const tagged = extractMentions(body)
      add({
        caseId: target.caseId,
        caseName: target.caseName,
        authorId: user.id,
        author: user.name,
        text: target.label ? `${target.label}: ${body}` : body,
        tagged,
      })
      return tagged
    },
    [add, user],
  )
}
