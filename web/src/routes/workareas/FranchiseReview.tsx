// ===========================================================================
// FranchiseReview — the Account Services view of a *submitted* franchise. The
// prototype runs as an admin, so the same person who submitted can also review
// here: read the whole captured form, open each uploaded document, run a quick
// pre-approval checklist, then decide — approve (advancing the case to Prepare
// Quotation), take ownership to edit the form, return it for corrections, or
// reject it.
// ===========================================================================
import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  Descriptions,
  Divider,
  Empty,
  Input,
  Modal,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, EditOutlined, EyeOutlined, FileTextOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Case } from '../../domain/types'
import { useCases } from '../../state/CaseProvider'
import { CreateFranchise, FRANCHISE_DOCS, initialForm } from './CreateFranchise'

const DOC_META: Record<string, { label: string; tag?: string }> = Object.fromEntries(
  FRANCHISE_DOCS.map((d) => [d.key, { label: d.label, tag: d.tag }]),
)
const COVERAGE_LABELS: Record<string, string> = {
  AA: 'None (AA)',
  CP: 'HMI (CP)',
  TP: 'TPA (TP)',
  AT: 'HMO (AT)',
}

// The quick pre-approval checklist. Every item must be ticked before approval.
const CHECKLIST = [
  'Company & contact information is complete and correct',
  'Membership estimate and coverage dates look right',
  'Required supporting documents are attached',
  'Business source / intermediary details are valid',
]

const dash = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s === '' ? '—' : s
}

export function FranchiseReview({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const accepted = c.franchise.status === 'accepted'
  const rejected = c.franchise.status === 'rejected'

  // Full captured form (saved formData overlaid on the company/franchise record).
  const f = initialForm(c)
  const docs = c.franchise.documents ?? []
  const affiliates = c.franchise.affiliateRows ?? []
  const isIntermediary = f.businessSource === 'Agent' || f.businessSource === 'Broker'

  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST.map(() => false))
  const allChecked = checked.every(Boolean)
  const [editing, setEditing] = useState(false)
  const [viewingDoc, setViewingDoc] = useState<{ slot: string; fileName: string } | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // Ownership: take over the submitted form and edit it in place. Saving or
  // resubmitting from the editable form updates the case status directly.
  if (editing) {
    return (
      <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
        <Alert
          type="warning"
          showIcon
          title="Editing on behalf of Sales"
          description="You've taken ownership of this franchise. Save a draft or resubmit from the form below, or stop editing to return to the review."
          action={
            <Button size="small" onClick={() => setEditing(false)}>
              Stop editing
            </Button>
          }
        />
        <CreateFranchise c={c} />
      </Space>
    )
  }

  function approve() {
    patchCase(c.id, (prev) => ({
      ...prev,
      currentWorkArea: 'prepare-quotation',
      franchise: { ...prev.franchise, status: 'accepted', returnReasons: undefined, rejectedAt: undefined, rejectedReason: undefined, acceptedAt: new Date().toISOString() },
    }))
    message.success('Franchise approved — moving on to Prepare Quotation.')
    navigate(`/cases/${c.id}/prepare-quotation`)
  }

  function returnForCorrections() {
    patchCase(c.id, (prev) => ({
      ...prev,
      currentWorkArea: 'create-franchise',
      franchise: { ...prev.franchise, status: 'returned', acceptedAt: undefined },
    }))
    message.info('Franchise returned for corrections.')
  }

  function confirmReject() {
    patchCase(c.id, (prev) => ({
      ...prev,
      currentWorkArea: 'create-franchise',
      franchise: {
        ...prev.franchise,
        status: 'rejected',
        acceptedAt: undefined,
        rejectedAt: new Date().toISOString(),
        rejectedReason: rejectReason.trim() || undefined,
      },
    }))
    setRejecting(false)
    message.warning('Franchise rejected.')
  }

  return (
    <div>
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
      {/* ---- Full submitted form (read-only) --------------------------------- */}
      <section>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Account Information
        </Typography.Title>
        <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
          <Descriptions.Item label="Account type">{dash(f.accountType)}</Descriptions.Item>
          <Descriptions.Item label="Company name">{dash(f.name)}</Descriptions.Item>
          <Descriptions.Item label="Nature of business">{dash(f.natureOfBusiness)}</Descriptions.Item>
          <Descriptions.Item label="TIN">{dash(f.tin)}</Descriptions.Item>
          <Descriptions.Item label="Company address" span={{ xs: 1, md: 2 }}>
            {dash([f.companyAddress, f.companyCity, f.companyProvince, f.companyRegion].filter(Boolean).join(', '))}
          </Descriptions.Item>
          <Descriptions.Item label="Billing address" span={{ xs: 1, md: 2 }}>
            {f.sameAsCompany
              ? 'Same as company address'
              : dash([f.billingAddress, f.billingCity, f.billingProvince, f.billingRegion].filter(Boolean).join(', '))}
          </Descriptions.Item>
          <Descriptions.Item label="Short name">{dash(f.shortName)}</Descriptions.Item>
          <Descriptions.Item label="Email">{dash(f.email)}</Descriptions.Item>
          <Descriptions.Item label="Telephone">{dash(f.telephone)}</Descriptions.Item>
          <Descriptions.Item label="Facsimile">{dash(f.facsimile)}</Descriptions.Item>
          <Descriptions.Item label="Contact person">{dash(f.contactPerson)}</Descriptions.Item>
          <Descriptions.Item label="Contact position">{dash(f.contactPosition)}</Descriptions.Item>
          <Descriptions.Item label="Contact number">{dash(f.contactNumber)}</Descriptions.Item>
          <Descriptions.Item label="Proposal addressee">{dash(f.proposalAddressee)}</Descriptions.Item>
          <Descriptions.Item label="Addressee position">{dash(f.addresseePosition)}</Descriptions.Item>
          <Descriptions.Item label="Addressee contact">{dash(f.addresseeContactNumber)}</Descriptions.Item>
        </Descriptions>
      </section>

      <section>
        <Typography.Title level={5}>Other Information</Typography.Title>
        <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
          <Descriptions.Item label="Employees">{dash(f.employeeCount)}</Descriptions.Item>
          <Descriptions.Item label="Dependents">{dash(f.dependentCount)}</Descriptions.Item>
          <Descriptions.Item label="Total lives">
            {(Number(f.employeeCount) || 0) + (Number(f.dependentCount) || 0)}
          </Descriptions.Item>
          <Descriptions.Item label="VAT status">{dash(f.vatStatus)}</Descriptions.Item>
          <Descriptions.Item label="Current coverage">
            {dash(COVERAGE_LABELS[f.currentCoverage] ?? f.currentCoverage)}
          </Descriptions.Item>
          <Descriptions.Item label="Manner of enrollment">{dash(f.mannerOfEnrollment)}</Descriptions.Item>
          <Descriptions.Item label="Manner of payment">{dash(f.mannerOfPayment)}</Descriptions.Item>
          <Descriptions.Item label="Requested by">{dash(f.requestedBy)}</Descriptions.Item>
          <Descriptions.Item label="Department">{dash(f.department)}</Descriptions.Item>
          <Descriptions.Item label="Business source">{dash(f.businessSource)}</Descriptions.Item>
          {isIntermediary && (
            <>
              <Descriptions.Item label="Agent/Broker name">{dash(f.businessSourceName)}</Descriptions.Item>
              <Descriptions.Item label="Commission type">{dash(f.commissionType)}</Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="Account handler (AAT)">{dash(f.accountManager)}</Descriptions.Item>
          <Descriptions.Item label="Secondary handler (AAT)">{dash(f.salesManager)}</Descriptions.Item>
          <Descriptions.Item label="Current HMO provider">{dash(f.currentHmoProvider)}</Descriptions.Item>
          <Descriptions.Item label="Current contract expiry">{dash(f.currentContractExpiry)}</Descriptions.Item>
          <Descriptions.Item label="Target effective date" span={{ xs: 1, md: 2 }}>
            {dash(f.targetEffectiveDate)}
          </Descriptions.Item>
          <Descriptions.Item label="Sales remarks" span={{ xs: 1, md: 2 }}>{dash(f.salesRemarks)}</Descriptions.Item>
          <Descriptions.Item label="Actuarial remarks" span={{ xs: 1, md: 2 }}>{dash(f.acusaRemarks)}</Descriptions.Item>
        </Descriptions>
      </section>

      <section>
        <Typography.Title level={5}>Documents</Typography.Title>
        {docs.length === 0 ? (
          <Typography.Text type="secondary">No documents attached.</Typography.Text>
        ) : (
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {docs.map((d) => (
              <div key={d.slot} className="app-decision-row">
                <Space>
                  <FileTextOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
                  <span>{DOC_META[d.slot]?.label ?? d.slot}</span>
                  <Typography.Text type="secondary">{d.fileName}</Typography.Text>
                </Space>
                <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setViewingDoc(d)}>
                  View
                </Button>
              </div>
            ))}
          </Space>
        )}
      </section>

      {affiliates.length > 0 && (
        <section>
          <Typography.Title level={5}>Affiliates</Typography.Title>
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {affiliates.map((a, i) => (
              <Typography.Text key={i}>• {dash(a.name)}</Typography.Text>
            ))}
          </Space>
        </section>
      )}

      <Divider style={{ margin: '4px 0' }} />

      {/* ---- Decision -------------------------------------------------------- */}
      {accepted && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          title="Franchise approved"
          description={
            c.franchise.acceptedAt
              ? `Approved on ${dayjs(c.franchise.acceptedAt).format('YYYY-MM-DD HH:mm')}.`
              : 'This franchise has been approved.'
          }
        />
      )}

      {rejected && (
        <Alert
          type="error"
          showIcon
          icon={<CloseCircleOutlined />}
          title="Franchise rejected"
          description={
            <>
              {c.franchise.rejectedAt && `Rejected on ${dayjs(c.franchise.rejectedAt).format('YYYY-MM-DD HH:mm')}. `}
              {c.franchise.rejectedReason ? `Reason: ${c.franchise.rejectedReason}` : 'No reason recorded.'}
            </>
          }
        />
      )}

      {!accepted && !rejected && (
        <section>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Quick checklist
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            Confirm each item before approving.
          </Typography.Paragraph>
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {CHECKLIST.map((item, i) => (
              <Checkbox
                key={i}
                checked={checked[i]}
                onChange={(e) =>
                  setChecked((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))
                }
              >
                {item}
              </Checkbox>
            ))}
          </Space>
        </section>
      )}
      </Space>

      {/* ---- Floating decision bar (consistent with the Create Franchise form) */}
      {!accepted && !rejected && (
        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {checked.filter(Boolean).length}/{CHECKLIST.length} checks complete
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit franchise form
            </Button>
            <Button onClick={returnForCorrections}>Return for corrections</Button>
            <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejecting(true)}>
              Reject
            </Button>
            <Tooltip title={allChecked ? '' : 'Tick every checklist item to approve.'}>
              <Button type="primary" icon={<CheckCircleOutlined />} disabled={!allChecked} onClick={approve}>
                Approve request
              </Button>
            </Tooltip>
          </div>
        </div>
      )}

      {rejected && (
        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">This franchise was rejected.</Typography.Text>
          <div className="app-form-floatbar__actions">
            <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Reopen & edit
            </Button>
          </div>
        </div>
      )}

      {/* ---- Document preview ------------------------------------------------ */}
      <Modal
        open={viewingDoc !== null}
        title={viewingDoc ? DOC_META[viewingDoc.slot]?.label ?? viewingDoc.slot : ''}
        onCancel={() => setViewingDoc(null)}
        footer={<Button onClick={() => setViewingDoc(null)}>Close</Button>}
      >
        {viewingDoc && (
          <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
            <Space>
              <Typography.Text strong>{viewingDoc.fileName}</Typography.Text>
              {DOC_META[viewingDoc.slot]?.tag && <Tag>{DOC_META[viewingDoc.slot]?.tag}</Tag>}
            </Space>
            <div
              style={{
                border: '1px dashed rgba(0,0,0,0.15)',
                borderRadius: 8,
                padding: 32,
                textAlign: 'center',
                background: 'rgba(0,0,0,0.02)',
              }}
            >
              <Empty
                image={<FileTextOutlined style={{ fontSize: 48, color: 'rgba(0,0,0,0.25)' }} />}
                description="Prototype: uploaded documents are simulated, so there's no file content to display."
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* ---- Reject dialog --------------------------------------------------- */}
      <Modal
        open={rejecting}
        title="Reject franchise"
        okText="Reject"
        okButtonProps={{ danger: true }}
        onOk={confirmReject}
        onCancel={() => setRejecting(false)}
      >
        <Typography.Paragraph type="secondary">
          Rejecting sends the franchise back to Sales as declined. Add a reason so they know why.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason for rejection (optional)"
        />
      </Modal>
    </div>
  )
}
