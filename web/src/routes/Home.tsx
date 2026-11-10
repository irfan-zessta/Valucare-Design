// ===========================================================================
// Home — the landing screen after sign-in. A calm overview with quick access to
// the destinations that exist in this build. Other departments are reachable
// from the sidebar and clearly marked "coming soon".
// ===========================================================================
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Divider, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/AuthProvider'
import { useCases } from '../state/CaseProvider'
import { meaningfulStatus } from '../domain/progress'
import { formatRelative } from '../lib/format'

export default function Home() {
  const { user } = useAuth()
  const { cases } = useCases()
  const navigate = useNavigate()
  const recent = [...cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return (
    <div className="app-page">
      <Typography.Title level={2} style={{ marginBottom: 4 }}>
        Welcome, {user?.name ?? 'Demo Admin'}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        ValuCare HMS demo workspace. Pick a department from the navigation, or jump into Sales below.
      </Typography.Paragraph>

      <Typography.Title level={5}>Available now</Typography.Title>
      <Card
        hoverable
        style={{ maxWidth: 420 }}
        onClick={() => navigate('/sales/corporate-new-business')}
      >
        <Card.Meta
          title="Corporate New Business"
          description="Start a prospect and follow it through to account activation and handover."
        />
      </Card>

      {recent.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 32 }}>
            Recent cases
          </Typography.Title>
          <Card>
            {recent.map((c, i) => (
              <div key={c.id}>
                {i > 0 && <Divider style={{ margin: '12px 0' }} />}
                <div className="app-home__recent-item">
                  <Link to={`/cases/${c.id}/${c.currentWorkArea}`}>{c.company.name}</Link>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {c.id} · {meaningfulStatus(c)} · {formatRelative(c.updatedAt)}
                  </Typography.Text>
                </div>
              </div>
            ))}
            <Button
              type="link"
              icon={<ArrowRightOutlined />}
              onClick={() => navigate('/sales/corporate-new-business')}
              style={{ paddingInline: 0, marginTop: 8 }}
            >
              View all New Business
            </Button>
          </Card>
        </>
      )}
    </div>
  )
}
