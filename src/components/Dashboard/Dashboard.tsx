import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useCompany } from '@/hooks/useCompany'
import { useFinancials } from '@/hooks/useFinancials'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useNews } from '@/hooks/useNews'
import { useGovernance } from '@/hooks/useGovernance'
import { formatMillionYen, formatPercent, formatPeriod } from '@/utils/formatters'
import type { GovernanceRating } from '@/types'

// Chart.js の登録（Dashboardで利用するコンポーネントのみ）
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

// ガバナンススコアバッジ（AISummaryCardと同色系）
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

const MARKET_BADGE: Record<
  'プライム' | 'スタンダード' | 'グロース',
  { bg: string; text: string }
> = {
  プライム: { bg: 'bg-blue-100', text: 'text-blue-700' },
  スタンダード: { bg: 'bg-gray-100', text: 'text-gray-600' },
  グロース: { bg: 'bg-green-100', text: 'text-green-700' },
}

// スケルトンローダー
const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-white rounded-xl shadow p-5 animate-pulse space-y-3 ${className}`}>
    <div className="h-4 bg-gray-200 rounded w-1/3" />
    <div className="h-3 bg-gray-100 rounded w-2/3" />
    <div className="h-3 bg-gray-100 rounded w-1/2" />
  </div>
)

const Dashboard: React.FC = () => {
  const { ticker } = useParams<{ ticker: string }>()
  const navigate = useNavigate()

  const safeTicker = ticker ?? ''

  const { data: company, loading: companyLoading } = useCompany(safeTicker)
  const { data: financials, loading: financialsLoading } = useFinancials(safeTicker, {
    periodType: 'annual',
  })
  const { data: analysisData, loading: analysisLoading } = useAnalysis(safeTicker)
  const { data: news, loading: newsLoading } = useNews(safeTicker, { limitCount: 5 })
  const { data: governance, loading: governanceLoading } = useGovernance(safeTicker)

  // 財務チャート用データ（最新3期分、古い順に並び替え）
  const chartPeriods = [...financials].reverse().slice(-3)

  const lineChartData = {
    labels: chartPeriods.map((f) => formatPeriod(f.period)),
    datasets: [
      {
        label: '売上高（百万円）',
        data: chartPeriods.map((f) => f.revenue),
        borderColor: '#1B365D',
        backgroundColor: 'rgba(27,54,93,0.1)',
        tension: 0.3,
        yAxisID: 'y',
      },
      {
        label: '営業利益（百万円）',
        data: chartPeriods.map((f) => f.operating_income),
        borderColor: '#2E75B6',
        backgroundColor: 'rgba(46,117,182,0.1)',
        tension: 0.3,
        yAxisID: 'y',
      },
    ],
  }

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: false },
    },
    scales: {
      y: { beginAtZero: false },
    },
  }

  // ニュース記事の published_at を Date に変換
  const getNewsDate = (article: (typeof news)[0]): string => {
    try {
      const ts = article.published_at
      if (ts && typeof ts === 'object' && 'toDate' in ts) {
        return (ts as { toDate: () => Date }).toDate().toLocaleDateString('ja-JP')
      }
      return new Date(ts as unknown as string).toLocaleDateString('ja-JP')
    } catch {
      return '-'
    }
  }

  // 収集日時の表示
  const getCollectedAt = (): string => {
    if (!company?.collected_at) return '-'
    try {
      const ts = company.collected_at
      if (typeof ts === 'object' && 'toDate' in ts) {
        return ts.toDate().toLocaleDateString('ja-JP')
      }
      return '-'
    } catch {
      return '-'
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800 sr-only">ダッシュボード</h2>

      {/* 上段: 企業概要 + ガバナンス */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 企業概要カード */}
        {companyLoading ? (
          <SkeletonCard />
        ) : (
          <button
            onClick={() => navigate(`/company/${safeTicker}/financials`)}
            className="bg-white rounded-xl shadow p-5 text-left hover:shadow-lg transition-shadow w-full"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900 truncate">
                  {company?.company_name ?? safeTicker}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {company?.sector_name ?? '-'}
                </p>
              </div>
              {company?.listing_market && (
                <span
                  className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    MARKET_BADGE[company.listing_market].bg
                  } ${MARKET_BADGE[company.listing_market].text}`}
                >
                  {company.listing_market}
                </span>
              )}
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">最新売上高</dt>
                <dd className="font-mono font-medium text-gray-800">
                  {financials[0] ? formatMillionYen(financials[0].revenue) : '-'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">時価総額</dt>
                <dd className="font-mono text-gray-500">-</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">収集日</dt>
                <dd className="text-gray-500 text-xs">{getCollectedAt()}</dd>
              </div>
            </dl>
            <p className="text-xs text-blue-600 mt-3">財務分析を見る →</p>
          </button>
        )}

        {/* ガバナンスカード */}
        {governanceLoading || analysisLoading ? (
          <SkeletonCard />
        ) : (
          <button
            onClick={() => navigate(`/company/${safeTicker}/governance`)}
            className="bg-white rounded-xl shadow p-5 text-left hover:shadow-lg transition-shadow w-full"
          >
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              ガバナンス
            </h3>
            {analysisData.summary ? (
              <div className="mb-3">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    GOVERNANCE_BADGE[analysisData.summary.governance_score.rating].bg
                  } ${GOVERNANCE_BADGE[analysisData.summary.governance_score.rating].text}`}
                >
                  {GOVERNANCE_BADGE[analysisData.summary.governance_score.rating].label} / 5
                </span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">AI分析未実行</p>
            )}
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">社外取締役比率</dt>
                <dd className="font-mono font-medium text-gray-800">
                  {governance
                    ? formatPercent(governance.outside_director_ratio)
                    : '-'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">取締役会人数</dt>
                <dd className="font-mono font-medium text-gray-800">
                  {governance
                    ? `${governance.board_members.length}名`
                    : '-'}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-blue-600 mt-3">ガバナンスを見る →</p>
          </button>
        )}
      </div>

      {/* 中段: 財務ハイライトチャート（全幅）*/}
      <button
        onClick={() => navigate(`/company/${safeTicker}/financials`)}
        className="w-full bg-white rounded-xl shadow p-5 text-left hover:shadow-lg transition-shadow"
      >
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          財務ハイライト（売上高・営業利益 直近3期）
        </h3>
        {financialsLoading ? (
          <div className="animate-pulse h-48 bg-gray-100 rounded" />
        ) : chartPeriods.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            財務データを収集してください
          </div>
        ) : (
          <div className="h-48">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        )}
        <p className="text-xs text-blue-600 mt-2">詳細な財務分析を見る →</p>
      </button>

      {/* 下段: 競合ポジション + ニュース */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 競合ポジション（散布図省略、シンプル版）*/}
        <button
          onClick={() => navigate(`/company/${safeTicker}/competitors`)}
          className="bg-white rounded-xl shadow p-5 text-left hover:shadow-lg transition-shadow w-full"
        >
          <h3 className="text-sm font-semibold text-gray-700 mb-3">競合ポジション</h3>
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            競合データを収集してください
          </div>
          <p className="text-xs text-blue-600 mt-2">競合比較を見る →</p>
        </button>

        {/* 最新ニュースフィード */}
        <button
          onClick={() => navigate(`/company/${safeTicker}/news`)}
          className="bg-white rounded-xl shadow p-5 text-left hover:shadow-lg transition-shadow w-full"
        >
          <h3 className="text-sm font-semibold text-gray-700 mb-3">最新ニュース</h3>
          {newsLoading ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
              ニュースを収集してください
            </div>
          ) : (
            <ul className="space-y-2">
              {news.map((article, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                    {getNewsDate(article)}
                  </span>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-blue-600 hover:underline line-clamp-2"
                  >
                    {article.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-blue-600 mt-3">ニュース一覧を見る →</p>
        </button>
      </div>
    </div>
  )
}

export default Dashboard
