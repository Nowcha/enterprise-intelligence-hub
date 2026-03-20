import React from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { useGovernance } from '@/hooks/useGovernance'
import { useCompany } from '@/hooks/useCompany'
import type { BoardMember, Committee, Shareholder } from '@/types'

ChartJS.register(ArcElement, Tooltip, Legend)

interface GovernanceViewProps {
  ticker: string
}

// ----------------------------------------------------------------
// Skeleton UI
// ----------------------------------------------------------------
const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
)

const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
    <SkeletonBlock className="h-5 w-40" />
    <div className="space-y-2">
      {[...Array(4)].map((_, i) => (
        <SkeletonBlock key={i} className="h-4 w-full" />
      ))}
    </div>
  </div>
)

// ----------------------------------------------------------------
// Board Members Table
// ----------------------------------------------------------------
const OutsideBadge: React.FC<{ isOutside: boolean; isIndependent: boolean }> = ({
  isOutside,
  isIndependent,
}) => {
  if (!isOutside) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
        社内
      </span>
    )
  }
  if (isIndependent) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
        独立社外
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
      社外
    </span>
  )
}

const BoardMembersTable: React.FC<{ members: BoardMember[] }> = ({ members }) => {
  if (members.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">取締役会情報がありません</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">氏名</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">役職</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">区分</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">就任年</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {members.map((member, idx) => (
            <tr key={idx} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                {member.name}
              </td>
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                {member.role}
              </td>
              <td className="px-4 py-3 text-center">
                <OutsideBadge
                  isOutside={member.is_outside}
                  isIndependent={member.is_independent}
                />
              </td>
              <td className="px-4 py-3 text-center text-gray-600">
                {member.appointment_year ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ----------------------------------------------------------------
// Committee Status
// ----------------------------------------------------------------
const CommitteeStatus: React.FC<{ committees: Committee[] }> = ({ committees }) => {
  const defaultCommittees: Committee[] = [
    { name: '指名委員会', exists: false, chair_name: null, member_count: null },
    { name: '報酬委員会', exists: false, chair_name: null, member_count: null },
    { name: '監査委員会', exists: false, chair_name: null, member_count: null },
  ]

  const displayList: Committee[] =
    committees.length > 0 ? committees : defaultCommittees

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {displayList.map((committee, idx) => (
        <div
          key={idx}
          className={`rounded-lg border-2 p-4 transition-colors ${
            committee.exists
              ? 'border-green-400 bg-green-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`w-3 h-3 rounded-full flex-shrink-0 ${
                committee.exists ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
            <span className="font-semibold text-sm text-gray-800">
              {committee.name}
            </span>
          </div>
          {committee.exists ? (
            <div className="space-y-1 text-xs text-gray-600">
              {committee.chair_name && (
                <p>委員長: {committee.chair_name}</p>
              )}
              {committee.member_count !== null && (
                <p>委員数: {committee.member_count}名</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">未設置</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------
// Shareholder Doughnut Chart
// ----------------------------------------------------------------
const CHART_COLORS = [
  '#1B365D',
  '#2E75B6',
  '#4A9AD4',
  '#6DB3E3',
  '#93CAF0',
  '#B0BEC5',
]

const ShareholderChart: React.FC<{ shareholders: Shareholder[] }> = ({ shareholders }) => {
  if (shareholders.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">株主情報がありません</p>
    )
  }

  const top5 = shareholders.slice(0, 5)
  const othersRatio =
    100 - top5.reduce((sum, s) => sum + s.ownership_ratio, 0)

  const labels = [
    ...top5.map((s) => s.name),
    ...(othersRatio > 0 ? ['その他'] : []),
  ]

  const dataValues = [
    ...top5.map((s) => s.ownership_ratio),
    ...(othersRatio > 0 ? [parseFloat(othersRatio.toFixed(2))] : []),
  ]

  const chartData = {
    labels,
    datasets: [
      {
        data: dataValues,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          font: { size: 11 },
          padding: 12,
          boxWidth: 14,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; parsed: number }) =>
            ` ${ctx.label ?? ''}: ${ctx.parsed.toFixed(2)}%`,
        },
      },
    },
    cutout: '60%',
  }

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-sm">
        <Doughnut data={chartData} options={options} />
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Outside Director Ratio Badge
// ----------------------------------------------------------------
const OutsideRatioBadge: React.FC<{ ratio: number }> = ({ ratio }) => {
  const pct = Math.round(ratio * 10) / 10
  let colorClass = 'bg-red-100 text-red-700'
  if (pct >= 50) {
    colorClass = 'bg-green-100 text-green-700'
  } else if (pct >= 33) {
    colorClass = 'bg-yellow-100 text-yellow-700'
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-bold ${colorClass}`}
      >
        {pct}%
      </span>
      <div className="flex-1 bg-gray-200 rounded-full h-3 max-w-xs">
        <div
          className={`h-3 rounded-full transition-all ${
            pct >= 50 ? 'bg-green-500' : pct >= 33 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-sm text-gray-500">
        {pct >= 50 ? 'CGコード適合' : pct >= 33 ? '要改善' : '要強化'}
      </span>
    </div>
  )
}

// ----------------------------------------------------------------
// Section Card wrapper
// ----------------------------------------------------------------
const SectionCard: React.FC<{
  title: string
  children: React.ReactNode
  badge?: React.ReactNode
}> = ({ title, children, badge }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-navy-900">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {badge && <div>{badge}</div>}
    </div>
    <div className="p-6">{children}</div>
  </div>
)

// ----------------------------------------------------------------
// Empty / Error States
// ----------------------------------------------------------------
const EmptyState: React.FC<{ ticker: string }> = ({ ticker }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
      <svg
        className="w-8 h-8 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </div>
    <p className="text-gray-700 font-medium text-lg mb-1">データがありません</p>
    <p className="text-gray-500 text-sm">
      証券コード {ticker} のガバナンスデータはまだ収集されていません
    </p>
    <p className="text-gray-400 text-xs mt-2">
      GitHub Actions の collect.yml を実行してデータを収集してください
    </p>
  </div>
)

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-red-50 border border-red-200 rounded-xl p-6">
    <p className="text-red-700 font-medium">データの読み込みに失敗しました</p>
    <p className="text-red-600 text-sm mt-1">{message}</p>
  </div>
)

// ----------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------
const GovernanceView: React.FC<GovernanceViewProps> = ({ ticker }) => {
  const { data: governance, loading: govLoading, error: govError } = useGovernance(ticker)
  const { data: company } = useCompany(ticker)

  if (govLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <SkeletonBlock className="h-7 w-48" />
          <SkeletonBlock className="h-5 w-20" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (govError) {
    return <ErrorState message={govError.message} />
  }

  if (!governance) {
    return <EmptyState ticker={ticker} />
  }

  const collectedDate =
    governance.collected_at
      ? new Date(governance.collected_at.seconds * 1000).toLocaleDateString('ja-JP')
      : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-navy-900">
          {company?.company_name ?? ticker}
        </h1>
        {company?.listing_market && (
          <span className="px-2 py-0.5 text-xs rounded bg-navy-100 text-navy-700 font-medium">
            {company.listing_market}
          </span>
        )}
        {collectedDate && (
          <span className="text-xs text-gray-400 ml-auto">
            最終収集: {collectedDate}
          </span>
        )}
      </div>

      {/* Outside Director Ratio */}
      <SectionCard title="社外取締役比率">
        <OutsideRatioBadge ratio={governance.outside_director_ratio} />
      </SectionCard>

      {/* Board Members */}
      <SectionCard
        title="取締役会構成"
        badge={
          <span className="text-xs text-navy-200 font-normal">
            {governance.board_members.length}名
          </span>
        }
      >
        <BoardMembersTable members={governance.board_members} />
      </SectionCard>

      {/* Committees + Shareholders side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Committees */}
        <SectionCard title="委員会設置状況">
          <CommitteeStatus committees={governance.committees} />
        </SectionCard>

        {/* Executive Compensation */}
        <SectionCard title="役員報酬">
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">固定報酬比率</span>
              <span className="font-semibold text-gray-900">
                {governance.executive_compensation.fixed_ratio > 0
                  ? `${governance.executive_compensation.fixed_ratio}%`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">変動報酬比率</span>
              <span className="font-semibold text-gray-900">
                {governance.executive_compensation.variable_ratio > 0
                  ? `${governance.executive_compensation.variable_ratio}%`
                  : '—'}
              </span>
            </div>
            {governance.executive_compensation.total_amount !== null && (
              <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-3">
                <span className="text-gray-600">役員報酬総額</span>
                <span className="font-semibold text-navy-900">
                  {governance.executive_compensation.total_amount.toLocaleString('ja-JP')} 百万円
                </span>
              </div>
            )}
            {governance.executive_compensation.fixed_ratio === 0 &&
              governance.executive_compensation.variable_ratio === 0 &&
              governance.executive_compensation.total_amount === null && (
                <p className="text-sm text-gray-400 text-center py-4">
                  報酬データがありません
                </p>
              )}
          </div>
        </SectionCard>
      </div>

      {/* Shareholder Chart */}
      <SectionCard
        title="大株主構成"
        badge={
          <span className="text-xs text-navy-200 font-normal">
            上位5名
          </span>
        }
      >
        <ShareholderChart shareholders={governance.major_shareholders} />
      </SectionCard>

      {/* CG Report Link */}
      {governance.cg_report_url && (
        <div className="text-right">
          <a
            href={governance.cg_report_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            コーポレートガバナンス報告書
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      )}
    </div>
  )
}

export default GovernanceView
