import React from 'react'
import type { AnalysisSummary, GovernanceRating, FinancialTrend } from '@/types'

interface AISummaryCardProps {
  summary: AnalysisSummary | null
  loading?: boolean
}

// Governance score badge colour mapping
const GOVERNANCE_BADGE: Record<
  GovernanceRating,
  { bg: string; text: string; label: string }
> = {
  1: { bg: 'bg-red-100', text: 'text-red-700', label: 'スコア 1' },
  2: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'スコア 2' },
  3: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'スコア 3' },
  4: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'スコア 4' },
  5: { bg: 'bg-green-100', text: 'text-green-700', label: 'スコア 5' },
}

// Financial trend badge colour mapping
const TREND_BADGE: Record<
  FinancialTrend,
  { bg: string; text: string; label: string }
> = {
  improving: { bg: 'bg-green-100', text: 'text-green-700', label: '改善傾向' },
  stable: { bg: 'bg-gray-100', text: 'text-gray-600', label: '安定' },
  declining: { bg: 'bg-red-100', text: 'text-red-700', label: '悪化傾向' },
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
    {children}
  </h3>
)

const BulletList: React.FC<{ items: string[]; accentClass?: string }> = ({
  items,
  accentClass = 'bg-blue-500',
}) => (
  <ul className="space-y-1">
    {items.map((item, idx) => (
      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
        <span
          className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${accentClass}`}
        />
        {item}
      </li>
    ))}
  </ul>
)

const LoadingSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-4 bg-gray-200 rounded w-3/4" />
    <div className="h-4 bg-gray-200 rounded w-1/2" />
    <div className="h-4 bg-gray-200 rounded w-2/3" />
  </div>
)

const AISummaryCard: React.FC<AISummaryCardProps> = ({ summary, loading = false }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">AI 分析サマリー</h2>
        <LoadingSkeleton />
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex flex-col items-center justify-center min-h-[160px] text-center">
        <svg
          className="w-10 h-10 text-gray-300 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-gray-500 text-sm font-medium">AI 分析未実行</p>
        <p className="text-gray-400 text-xs mt-1">
          GitHub Actions の analyze ワークフローを実行してください
        </p>
      </div>
    )
  }

  const govBadge = GOVERNANCE_BADGE[summary.governance_score.rating]
  const trendBadge = TREND_BADGE[summary.financial_highlights.trend]
  const metrics = summary.financial_highlights.key_metrics

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">AI 分析サマリー</h2>
        <span className="text-xs text-gray-400">
          {summary.analyzed_at
            ? new Date(
                typeof summary.analyzed_at === 'object' &&
                'toDate' in summary.analyzed_at
                  ? (summary.analyzed_at as { toDate: () => Date }).toDate()
                  : summary.analyzed_at
              ).toLocaleDateString('ja-JP')
            : ''}
        </span>
      </div>

      {/* Company profile */}
      <section>
        <SectionTitle>企業概要</SectionTitle>
        <p className="text-sm text-gray-700 leading-relaxed">
          {summary.company_profile}
        </p>
      </section>

      {/* Scores row */}
      <section className="grid grid-cols-2 gap-4">
        {/* Governance score */}
        <div className="border border-gray-100 rounded-lg p-3">
          <SectionTitle>ガバナンススコア</SectionTitle>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${govBadge.bg} ${govBadge.text}`}
            >
              {govBadge.label} / 5
            </span>
          </div>
          <p className="text-xs text-gray-600">{summary.governance_score.comment}</p>
        </div>

        {/* Financial trend */}
        <div className="border border-gray-100 rounded-lg p-3">
          <SectionTitle>財務トレンド</SectionTitle>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${trendBadge.bg} ${trendBadge.text}`}
            >
              {trendBadge.label}
            </span>
          </div>
          {metrics && (
            <dl className="text-xs text-gray-600 space-y-0.5 mt-1">
              {metrics.revenue_latest !== undefined && (
                <div className="flex justify-between">
                  <dt>売上高</dt>
                  <dd className="font-mono">
                    {(metrics.revenue_latest / 1000).toFixed(1)} 十億円
                  </dd>
                </div>
              )}
              {metrics.operating_margin_latest !== undefined && (
                <div className="flex justify-between">
                  <dt>営業利益率</dt>
                  <dd className="font-mono">
                    {metrics.operating_margin_latest.toFixed(1)} %
                  </dd>
                </div>
              )}
              {metrics.roe_latest !== undefined && (
                <div className="flex justify-between">
                  <dt>ROE</dt>
                  <dd className="font-mono">{metrics.roe_latest.toFixed(1)} %</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      {/* Financial comment */}
      {summary.financial_highlights.comment && (
        <section>
          <SectionTitle>財務コメント</SectionTitle>
          <p className="text-sm text-gray-700 leading-relaxed">
            {summary.financial_highlights.comment}
          </p>
        </section>
      )}

      {/* Competitive position */}
      <section>
        <SectionTitle>競合ポジション</SectionTitle>
        <p className="text-sm text-gray-700 leading-relaxed">
          {summary.competitive_position}
        </p>
      </section>

      {/* Risks & Opportunities */}
      <section className="grid grid-cols-2 gap-4">
        <div>
          <SectionTitle>リスク</SectionTitle>
          <BulletList items={summary.risks} accentClass="bg-red-400" />
        </div>
        <div>
          <SectionTitle>機会</SectionTitle>
          <BulletList items={summary.opportunities} accentClass="bg-green-400" />
        </div>
      </section>

      {/* Consulting suggestions */}
      <section>
        <SectionTitle>コンサルティング示唆</SectionTitle>
        <BulletList
          items={summary.consulting_suggestions}
          accentClass="bg-blue-500"
        />
      </section>
    </div>
  )
}

export default AISummaryCard
