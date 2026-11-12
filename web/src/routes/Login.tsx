// ===========================================================================
// Sign-in screen — rendered outside the application shell. SIMULATED auth only
// (see services/authService.ts): a demo gate, not production security.
//
// Normal sign-in opens Home; arriving via a direct link to a protected screen
// returns the user there after sign-in. "Use demo credentials" fills the fields;
// the user still presses Sign in. Ant Form handles required-field validation;
// wrong credentials surface in an Alert.
// ===========================================================================
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, Tag, Typography } from 'antd'
import { useAuth } from '../auth/AuthProvider'
import { DEMO_CREDENTIALS } from '../services/authService'
import { ValucareLogo } from '../components/shell/ValucareLogo'

interface FromState {
  from?: { pathname: string }
}
interface LoginValues {
  email: string
  password: string
}

export default function Login() {
  const { isAuthenticated, signIn, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const deepLink = (location.state as FromState | null)?.from?.pathname

  const [form] = Form.useForm<LoginValues>()
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Already signed in — go to the deep link, else the user's department dashboard.
  if (isAuthenticated) {
    return <Navigate to={deepLink ?? user?.departmentPath ?? '/'} replace />
  }

  function useDemoCredentials() {
    form.setFieldsValue({ email: DEMO_CREDENTIALS.email, password: DEMO_CREDENTIALS.password })
    setFormError('')
  }

  async function onFinish(values: LoginValues) {
    setFormError('')
    setSubmitting(true)
    const result = await signIn(values.email, values.password)
    setSubmitting(false)
    if (result.ok) {
      // Deep link wins; otherwise open the user's configured department dashboard.
      navigate(deepLink ?? result.data.departmentPath ?? '/', { replace: true })
    } else {
      setFormError(result.error.message)
    }
  }

  return (
    <div className="app-login">
      <Card className="app-login__card">
        <div className="app-login__brand">
          <ValucareLogo size={48} />
        </div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          Sign in to ValuCare HMS
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          Use the demo account to explore the workspace. No setup required.
        </Typography.Paragraph>

        {formError && (
          <Alert
            type="error"
            showIcon
            title="Sign in failed"
            description={formError}
            style={{ marginBottom: 16 }}
          />
        )}

        <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, message: 'Enter your email address.' }]}
          >
            <Input type="email" placeholder="you@valucare.example" autoComplete="username" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Enter your password.' }]}
          >
            <Input.Password placeholder="Password" autoComplete="current-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              Sign in
            </Button>
          </Form.Item>
          <Button type="link" block onClick={useDemoCredentials} style={{ paddingInline: 0 }}>
            Use demo credentials
          </Button>
        </Form>

        <div className="app-login__demo">
          <Tag>Demo environment</Tag>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Simulated sign-in only — not production security. Demo account:{' '}
            <Typography.Text code>{DEMO_CREDENTIALS.email}</Typography.Text> /{' '}
            <Typography.Text code>{DEMO_CREDENTIALS.password}</Typography.Text>
          </Typography.Paragraph>
        </div>
      </Card>
    </div>
  )
}
