// ===========================================================================
// Request supporting panel — Documents, Comments and History, available on every
// Actuarial work area without leaving the request. Comments are a contextual
// discussion (distinct from the system audit History below them).
// ===========================================================================
import { useState } from 'react'
import { App, Button, Empty, Input, List, Space, Tabs, Tag, Typography } from 'antd'
import { CommentOutlined, FileTextOutlined, HistoryOutlined } from '@ant-design/icons'
import { CaseHistory } from '../../components/case/CaseHistory'
import { useComments } from '../../state/CommentsProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { FormSection } from '../../components/ui/FormSection'
import { formatDateTime } from '../../lib/format'
import type { Case } from '../../domain/types'

const { Text } = Typography

function Documents({ c }: { c: Case }) {
  if (!c.documents.length) {
    return <Empty description="No supporting documents on this request yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }
  return (
    <List
      size="small"
      dataSource={c.documents}
      renderItem={(d) => (
        <List.Item>
          <List.Item.Meta
            avatar={<FileTextOutlined style={{ fontSize: 18, color: '#8c8c8c' }} />}
            title={<span>{d.name} {d.simulated && <Tag>Sample</Tag>}</span>}
            description={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {d.kind} · v{d.version} · {d.providedBy} · {formatDateTime(d.uploadedAt)}
              </Text>
            }
          />
        </List.Item>
      )}
    />
  )
}

function Comments({ c }: { c: Case }) {
  const { forCase, add } = useComments()
  const { user } = useActiveUser()
  const { message } = App.useApp()
  const [text, setText] = useState('')
  const thread = forCase(c.id)

  const post = () => {
    const body = text.trim()
    if (!body) return
    add({ caseId: c.id, caseName: c.company.name, authorId: user.id, author: user.name, text: body, tagged: [] })
    setText('')
    message.success('Comment posted.')
  }

  return (
    <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
      {thread.length === 0 ? (
        <Empty description="No comments yet. Start a discussion on this request." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={thread}
          renderItem={(m) => (
            <List.Item>
              <List.Item.Meta
                title={<span>{m.author} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>· {formatDateTime(m.at)}</Text></span>}
                description={<span style={{ color: '#1f1f1f', whiteSpace: 'pre-wrap' }}>{m.text}</span>}
              />
            </List.Item>
          )}
        />
      )}
      <div>
        <Input.TextArea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment for the team…"
          aria-label="Add a comment"
        />
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <Button type="primary" disabled={!text.trim()} onClick={post}>Comment</Button>
        </div>
      </div>
    </Space>
  )
}

export function RequestSupporting({ c }: { c: Case }) {
  return (
    <FormSection wide title="Documents, comments & history">
      <Tabs
        items={[
          { key: 'docs', label: <span><FileTextOutlined /> Documents</span>, children: <Documents c={c} /> },
          { key: 'comments', label: <span><CommentOutlined /> Comments</span>, children: <Comments c={c} /> },
          { key: 'history', label: <span><HistoryOutlined /> History</span>, children: <CaseHistory c={c} /> },
        ]}
      />
    </FormSection>
  )
}
