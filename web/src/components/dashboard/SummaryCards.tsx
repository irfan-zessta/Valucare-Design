// ===========================================================================
// "My work" summary cards — at most four, role-specific, each computed from the
// real records. A card states what it counts (its unit) and the timeframe where
// relevant, and opens the matching worklist view when clicked (keeping that
// filter visible). No decorative deltas: a figure is just the count it measures.
// ===========================================================================
import { Card, Skeleton } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import type { CardTarget, SummaryCard } from '../../domain/salesWork'

export function SummaryCards({
  cards,
  onSelect,
  loading,
}: {
  cards: SummaryCard[]
  onSelect: (t: CardTarget) => void
  loading?: boolean
}) {
  return (
    <div className="app-dashboard__stats mywork-cards">
      {cards.map((card) => (
        <Card key={card.key} size="small" className="mywork-card" styles={{ body: { padding: 0 } }}>
          <button
            type="button"
            className={`mywork-card__btn${card.tone === 'attention' ? ' mywork-card__btn--attn' : ''}`}
            onClick={() => onSelect(card.target)}
            aria-label={`${card.title}: ${card.value} ${card.unit}. Open the matching list.`}
          >
            {loading ? (
              <Skeleton active paragraph={false} title={{ width: '70%' }} />
            ) : (
              <>
                <span className="mywork-card__title">{card.title}</span>
                <span className="mywork-card__value">{card.value}</span>
                <span className="mywork-card__meta">
                  <span className="mywork-card__unit">
                    {card.unit}
                    {card.timeframe ? ` · ${card.timeframe}` : ''}
                  </span>
                  <ArrowRightOutlined className="mywork-card__go" aria-hidden />
                </span>
              </>
            )}
          </button>
        </Card>
      ))}
    </div>
  )
}
