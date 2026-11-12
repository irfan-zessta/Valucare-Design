// ===========================================================================
// Header notifications — a bell with an "unseen" red dot and a small popover
// list. This is a demo surface (no live notification feed): the dot signals
// unseen items and clears once the popover is opened.
// ===========================================================================
import { useState } from 'react'
import { Badge, Button, Empty, List, Popover, Typography } from 'antd'
import { BellOutlined } from '@ant-design/icons'

interface DemoNote {
  id: string
  title: string
  when: string
}

// A couple of calm, generic demo notifications (no specific seeded record ids,
// so nothing goes stale as the demo data changes).
const DEMO_NOTES: DemoNote[] = [
  { id: 'n1', title: 'A franchise was returned for corrections.', when: '2h ago' },
  { id: 'n2', title: 'A quotation is ready for your review.', when: 'Yesterday' },
]

const SEEN_KEY = 'valucare-hms:notifications-seen'

export function HeaderNotifications() {
  const [open, setOpen] = useState(false)
  // "Unseen" persists for the session so dismissing the dot sticks across navigation.
  const [seen, setSeen] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) === '1'
    } catch {
      return false
    }
  })

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && !seen) {
      setSeen(true)
      try {
        sessionStorage.setItem(SEEN_KEY, '1')
      } catch {
        // ignore unavailable storage
      }
    }
  }

  const content = (
    <div style={{ width: 300 }}>
      {DEMO_NOTES.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No new notifications" />
      ) : (
        <List
          size="small"
          dataSource={DEMO_NOTES}
          renderItem={(n) => (
            <List.Item>
              <List.Item.Meta
                title={<span style={{ fontWeight: 500 }}>{n.title}</span>}
                description={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {n.when}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  )

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      content={content}
    >
      <Badge dot={!seen && DEMO_NOTES.length > 0} offset={[-4, 4]}>
        <Button type="text" shape="circle" icon={<BellOutlined />} aria-label="Notifications" />
      </Badge>
    </Popover>
  )
}
