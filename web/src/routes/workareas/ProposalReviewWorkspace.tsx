// ===========================================================================
// ProposalReviewWorkspace — the decision-first review surface shown to internal
// reviewers (checkers: Sales Supervisor / Senior Management). It is a STRUCTURED
// presentation of the existing proposal data — never a new document, never new
// numbers. The original formal document stays reachable via Print / Save as PDF
// (onPrintPdf), so nothing contractual is altered here.
//
// Reading order is deliberately decision-first:
//   1. Commercial summary   — the recommendation + justification at a glance.
//   2. Benefits comparison  — client TOR vs proposed SOB, concerns surfaced first.
//   3. Summary of Benefits  — the full proposed coverage, grouped by category.
//   4. Case history         — the shared audit trail (rendered by the workspace).
// All counts, rows and impacts are derived live from buildComparison / the SOB.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Card,
  Collapse,
  Empty,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  MinusOutlined,
  PlusOutlined,
  PrinterOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Case, ProposalStatus, ProposalVersion, SobBenefitLine, SobDraft } from '../../domain/types'
import { isRichSob } from '../../domain/sobModel'
import {
  buildComparison,
  parsePeso,
  STATUS_META,
  type CompareRow,
  type CompareStatus,
} from './sob/sobCompare'

const TEXT = '#1f1f1f'
const TEXT_2 = '#595959'
const BORDER = '#e8e8e8'

// Proposal lifecycle → restrained Tag. Brand red is reserved for actions, so the
// status tag stays neutral/semantic (never the brand colour).
const PROPOSAL_STATUS: Record<ProposalStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Draft' },
  'in-review': { color: 'blue', label: 'In review' },
  sent: { color: 'cyan', label: 'Sent to client' },
  feedback: { color: 'gold', label: 'In negotiation' },
  revised: { color: 'default', label: 'Revised' },
  accepted: { color: 'green', label: 'Accepted' },
}

// Comparison status → outlined icon (so meaning never rides on colour alone).
const STATUS_ICON: Record<CompareStatus, ReactNode> = {
  improved: <ArrowUpOutlined />,
  reduced: <ArrowDownOutlined />,
  added: <PlusOutlined />,
  missing: <CloseCircleOutlined />,
  mixed: <SwapOutlined />,
  review: <ExclamationCircleOutlined />,
  unchanged: <MinusOutlined />,
}

const fmtPeso = (n: number) => `Php ${n.toLocaleString()}`

function statusTag(s: CompareStatus) {
  return (
    <Tag color={STATUS_META[s].color} icon={STATUS_ICON[s]} style={{ marginInlineEnd: 0 }}>
      {STATUS_META[s].label}
    </Tag>
  )
}

export function ProposalReviewWorkspace({
  c,
  proposal,
  sob,
  sobVersion,
  onPrintPdf,
}: {
  c: Case
  proposal: ProposalVersion
  sob?: SobDraft
  sobVersion: number
  onPrintPdf: () => void
}) {
  const { rows } = useMemo(
    () => buildComparison(c.quotation.torLines, sob),
    [c.quotation.torLines, sob],
  )

  // Concerns float to the top; everything else keeps its document order (stable).
  const sortedRows = useMemo(
    () =>
      rows
        .map((r, i) => ({ r, i }))
        .sort(
          (a, b) =>
            Number(STATUS_META[b.r.status].attention) - Number(STATUS_META[a.r.status].attention) ||
            a.i - b.i,
        )
        .map((x) => x.r),
    [rows],
  )

  const statusMeta = PROPOSAL_STATUS[proposal.status]

  // ---- Table cells ---------------------------------------------------------
  const torCell = (r: CompareRow) =>
    r.tor ? (
      r.tor.limit || <Typography.Text type="secondary">Not specified in TOR</Typography.Text>
    ) : (
      <Typography.Text type="secondary">—</Typography.Text>
    )
  const sobCell = (r: CompareRow) => {
    if (!r.sob) return <Typography.Text type="secondary">—</Typography.Text>
    if (r.sob.coverage === 'not-covered') return <Typography.Text type="secondary">Excluded</Typography.Text>
    if (r.sob.coverage === 'not-specified')
      return <Typography.Text type="secondary">Not specified</Typography.Text>
    return <span style={{ fontWeight: 500 }}>{r.sob.limits || 'Covered'}</span>
  }

  const columns = [
    {
      title: 'Benefit',
      dataIndex: 'benefit',
      width: '28%',
      render: (v: string) => <span style={{ fontWeight: 500, color: TEXT }}>{v}</span>,
    },
    { title: 'Client TOR', dataIndex: 'tor', width: '24%', render: (_: unknown, r: CompareRow) => torCell(r) },
    { title: 'Proposed SOB', dataIndex: 'sob', width: '24%', render: (_: unknown, r: CompareRow) => sobCell(r) },
    {
      title: 'Difference / impact',
      dataIndex: 'impact',
      width: '24%',
      render: (_: unknown, r: CompareRow) => (
        <Space orientation="vertical" size={4} style={{ display: 'flex' }}>
          {statusTag(r.status)}
          {r.impact && (
            <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {r.impact}
            </Typography.Text>
          )}
        </Space>
      ),
    },
  ]

  // Expanded row: honest side-by-side + a numeric delta only when both amounts
  // are stated verbatim (parsePeso never infers).
  const expandedRowRender = (r: CompareRow) => {
    const torAmt = parsePeso(r.tor?.limit)
    const sobAmt = parsePeso([r.sob?.limitAmount, r.sob?.limits].filter(Boolean).join(' '))
    const showDelta = torAmt != null && sobAmt != null && torAmt !== sobAmt
    const max = showDelta ? Math.max(torAmt, sobAmt) : 0
    const bar = (n: number, color: string) => (
      <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${max ? (n / max) * 100 : 0}%`, height: '100%', background: color }} />
      </div>
    )
    const diff = showDelta ? sobAmt - torAmt : 0
    const pct = showDelta && torAmt !== 0 ? Math.round((diff / torAmt) * 100) : null

    return (
      <div style={{ padding: '8px 4px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Client requirement (TOR)
            </Typography.Text>
            <div style={{ marginTop: 4 }}>
              {r.tor ? r.tor.limit || 'Not specified in TOR' : 'Not in the client TOR'}
            </div>
            {r.tor?.note && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {r.tor.note}
              </Typography.Text>
            )}
          </div>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Proposed (SOB)
            </Typography.Text>
            <div style={{ marginTop: 4 }}>
              {!r.sob
                ? 'Not in the proposed SOB'
                : r.sob.coverage === 'not-covered'
                  ? 'Excluded'
                  : r.sob.coverage === 'not-specified'
                    ? 'Not specified'
                    : r.sob.limits || 'Covered'}
            </div>
            {r.sob?.limitFrequency && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Frequency: {r.sob.limitFrequency}
              </Typography.Text>
            )}
            {r.sob?.applicablePlan && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Applies to: {r.sob.applicablePlan}
                </Typography.Text>
              </div>
            )}
          </div>
        </div>

        {showDelta && (
          <div style={{ marginTop: 12, maxWidth: 420 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Client TOR
              </Typography.Text>
              {bar(torAmt!, '#bfbfbf')}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Proposed SOB
              </Typography.Text>
              {bar(sobAmt!, diff >= 0 ? STATUS_META.improved.hex : STATUS_META.reduced.hex)}
            </div>
            <Typography.Text style={{ fontSize: 12, marginTop: 6, display: 'inline-block' }}>
              {diff >= 0 ? '+' : '−'}
              {fmtPeso(Math.abs(diff))}
              {pct != null ? ` (${diff >= 0 ? '+' : '−'}${Math.abs(pct)}%)` : ''}
            </Typography.Text>
          </div>
        )}

        {r.suggestion && r.match === 'none' && (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Possible counterpart in the SOB: <strong>{r.suggestion}</strong> (not auto-matched).
          </Typography.Paragraph>
        )}
      </div>
    )
  }

  // ---- Summary of Benefits (grouped by the SOB's own categories) -----------
  const rich = sob && isRichSob(sob)
  const sections = rich ? sob!.sections ?? [] : []
  const flattenLines = (lines: SobBenefitLine[]): SobBenefitLine[] => {
    const out: SobBenefitLine[] = []
    const walk = (ls: SobBenefitLine[]) =>
      ls.forEach((l) => {
        if (l.description?.trim()) out.push(l)
        if (l.children?.length) walk(l.children)
      })
    walk(lines)
    return out
  }
  const populated = sections
    .map((sec) => ({ sec, lines: flattenLines(sec.lines ?? []) }))
    .filter((s) => s.lines.length > 0)
  const emptyCats = sections.filter((sec) => flattenLines(sec.lines ?? []).length === 0)

  const [sobKeys, setSobKeys] = useState<string[]>([])
  useEffect(() => {
    setSobKeys(populated.map((s) => s.sec.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sob?.version])

  const sobCov = (l: SobBenefitLine) =>
    l.coverage === 'not-covered' ? (
      <Tag color="red" style={{ marginInlineEnd: 0 }}>
        Excluded
      </Tag>
    ) : l.coverage === 'not-specified' ? (
      <Tag color="gold" style={{ marginInlineEnd: 0 }}>
        Not specified
      </Tag>
    ) : (
      <Typography.Text type="secondary">Covered</Typography.Text>
    )

  const sobColumns = [
    { title: 'Benefit', dataIndex: 'description', width: '46%', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: 'Coverage', dataIndex: 'coverage', width: '18%', render: (_: unknown, l: SobBenefitLine) => sobCov(l) },
    {
      title: 'Limits',
      dataIndex: 'limits',
      width: '36%',
      render: (v: string) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
  ]

  const metaItem = (label: string, value: ReactNode) => (
    <span style={{ color: TEXT_2, fontSize: 13 }}>
      {label} <span style={{ color: TEXT, fontWeight: 500 }}>{value}</span>
    </span>
  )

  const sectionTitle = (text: string) => (
    <Typography.Title level={5} style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
      {text}
    </Typography.Title>
  )

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ---- Proposal header ------------------------------------------- */}
        <Card styles={{ body: { padding: 20 } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <Space align="center" size={10}>
                <Typography.Title style={{ margin: 0, fontSize: 26, fontWeight: 600, color: TEXT }}>
                  {proposal.code ?? 'Proposal'}
                </Typography.Title>
                <Tag color={statusMeta.color} style={{ marginInlineEnd: 0 }}>
                  {statusMeta.label}
                </Tag>
              </Space>
              <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {metaItem('Company', c.company.name)}
                {metaItem('Proposal version', `v${proposal.version}`)}
                {metaItem('SOB version', `v${sobVersion}`)}
                {proposal.validUntil &&
                  metaItem('Valid until', dayjs(proposal.validUntil).format('DD MMM YYYY'))}
              </div>
            </div>
            <Button icon={<PrinterOutlined />} onClick={onPrintPdf}>
              Print / Save as PDF
            </Button>
          </div>
        </Card>

        {/* ---- 1 · Commercial summary ------------------------------------ */}
        <section id="rev-commercial">
          <Card title={sectionTitle('Commercial summary')} styles={{ body: { padding: 20 } }}>
            <Space size={56} wrap style={{ marginBottom: 4 }}>
              <Statistic
                title="Intermediary commission"
                value={proposal.commissionPct ?? '—'}
                suffix={proposal.commissionPct != null ? '%' : undefined}
                styles={{ content: { fontWeight: 600 } }}
              />
            </Space>
            <div
              style={{
                marginTop: 12,
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 12,
                borderTop: `1px solid ${BORDER}`,
                paddingTop: 16,
              }}
            >
              {[
                ['Commission note', proposal.commissionNote],
                ['Rates recommendation', proposal.recommendation],
                ['Rates justification', proposal.justification],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {label}
                  </Typography.Text>
                  <Typography.Text style={{ color: TEXT }}>
                    {(value as string) || <Typography.Text type="secondary">—</Typography.Text>}
                  </Typography.Text>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* ---- 2 · Benefits comparison (primary) ------------------------- */}
        <section id="rev-comparison">
          <Card
            title={sectionTitle('Benefits comparison')}
            styles={{ body: { padding: 20 } }}
          >
            <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
              Client requirements (TOR) vs. the proposed Summary of Benefits (SOB). Benefits needing review are
              listed first.
            </Typography.Paragraph>

            {rows.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No captured TOR to compare against the proposed SOB."
              />
            ) : (
              <Table<CompareRow>
                rowKey="key"
                dataSource={sortedRows}
                columns={columns}
                pagination={false}
                size="middle"
                expandable={{
                  expandedRowRender,
                  rowExpandable: (r) => !!(r.tor && r.sob) || !!r.suggestion,
                }}
                scroll={{ x: 720 }}
              />
            )}
          </Card>
        </section>

        {/* ---- 3 · Summary of Benefits ----------------------------------- */}
        <section id="rev-sob">
          <Card
            title={sectionTitle('Summary of Benefits')}
            extra={
              rich && populated.length > 0 ? (
                <Space size={4}>
                  <Tag style={{ marginInlineEnd: 4 }}>v{sob!.version}</Tag>
                  <Button size="small" type="text" onClick={() => setSobKeys(populated.map((s) => s.sec.id))}>
                    Expand all
                  </Button>
                  <Button size="small" type="text" onClick={() => setSobKeys([])}>
                    Collapse all
                  </Button>
                </Space>
              ) : sob ? (
                <Tag style={{ marginInlineEnd: 0 }}>v{sob.version}</Tag>
              ) : undefined
            }
            styles={{ body: { padding: rich && populated.length ? 12 : 20 } }}
          >
            {!sob ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No Summary of Benefits created yet." />
            ) : rich ? (
              <>
                <Collapse
                  activeKey={sobKeys}
                  onChange={(k) => setSobKeys(k as string[])}
                  items={populated.map(({ sec, lines }) => ({
                    key: sec.id,
                    label: (
                      <Space>
                        <strong>{sec.title}</strong>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {lines.length} benefit{lines.length === 1 ? '' : 's'}
                        </Typography.Text>
                      </Space>
                    ),
                    children: (
                      <Table<SobBenefitLine>
                        rowKey="id"
                        dataSource={lines}
                        columns={sobColumns}
                        pagination={false}
                        size="small"
                      />
                    ),
                  }))}
                />
                {emptyCats.length > 0 && (
                  <Collapse
                    style={{ marginTop: 12 }}
                    items={[
                      {
                        key: 'empty',
                        label: (
                          <Typography.Text type="secondary">
                            Categories with no recorded benefits ({emptyCats.length})
                          </Typography.Text>
                        ),
                        children: (
                          <Space wrap size={[8, 8]}>
                            {emptyCats.map((sec) => (
                              <Tag key={sec.id} style={{ marginInlineEnd: 0 }}>
                                {sec.title}
                              </Tag>
                            ))}
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </>
            ) : (
              <Table
                rowKey={(_, i) => String(i)}
                dataSource={sob.lines ?? []}
                pagination={false}
                size="small"
                columns={[
                  { title: 'Benefit', dataIndex: 'benefit', render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
                  { title: 'Limit', dataIndex: 'limit', render: (v: string) => v || <Typography.Text type="secondary">—</Typography.Text> },
                  { title: 'Note', dataIndex: 'note', render: (v: string) => v || <Typography.Text type="secondary">—</Typography.Text> },
                ]}
              />
            )}
          </Card>
        </section>
    </div>
  )
}
