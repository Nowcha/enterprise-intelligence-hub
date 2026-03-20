import React, { useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { useFinancials } from '@/hooks/useFinancials'
import { formatMillionYen, formatPercent, formatPeriod } from '@/utils/formatters'
import type { FinancialPeriod } from '@/types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface FinancialChartsProps {
  ticker: string
}

type PeriodTab = 'annual' | 'quarterly'

// チャートカラー定義
const COLOR_REVENUE = '#1B365D'
const COLOR_OPERATING_INCOME = '#2E75B6'
const COLOR_NET_INCOME = '#D4760A'
const COLOR_OPERATING_CF = '#22863a'
const COLOR_INVESTING_CF = '#cb2431'
const COLOR_FINANCING_CF = '#6f42c1'

// スケルトンローディングコンポーネント
const ChartSkeleton: React.FC = () => (
  <div className="animate-pulse bg-gray-200 rounded-lg h-64 w-full" />
)

// データなし状態コンポーネント
const NoData: React.FC = () => (
  <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
    <p className="text-gray-500 text-sm">データがありません</p>
  </div>
)

// 主要指標サマリーテーブル
const SummaryTable: React.FC<{ periods: FinancialPeriod[] }> = ({ periods }) => {
  // 最新5期分に絞る
  const recent = periods.slice(0, 5)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-700 whitespace-nowrap">
              指標
            </th>
            {recent.map((p) => (
              <th
                key={p.period}
                className="text-right px-3 py-2 border border-gray-200 font-semibold text-gray-700 whitespace-nowrap"
              >
                {formatPeriod(p.period)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <MetricRow label="売上高" periods={recent} getValue={(p) => formatMillionYen(p.revenue)} />
          <MetricRow
            label="営業利益"
            periods={recent}
            getValue={(p) => formatMillionYen(p.operating_income)}
          />
          <MetricRow
            label="経常利益"
            periods={recent}
            getValue={(p) => formatMillionYen(p.ordinary_income)}
          />
          <MetricRow
            label="当期純利益"
            periods={recent}
            getValue={(p) => formatMillionYen(p.net_income)}
          />
          <MetricRow
            label="総資産"
            periods={recent}
            getValue={(p) => formatMillionYen(p.total_assets)}
          />
          <MetricRow
            label="純資産"
            periods={recent}
            getValue={(p) => formatMillionYen(p.net_assets)}
          />
          <MetricRow
            label="自己資本比率"
            periods={recent}
            getValue={(p) => formatPercent(p.equity_ratio)}
          />
          <MetricRow label="ROE" periods={recent} getValue={(p) => formatPercent(p.roe)} />
          <MetricRow label="ROA" periods={recent} getValue={(p) => formatPercent(p.roa)} />
          <MetricRow
            label="EPS (円)"
            periods={recent}
            getValue={(p) => (p.eps !== null ? p.eps.toLocaleString('ja-JP') : '-')}
          />
        </tbody>
      </table>
    </div>
  )
}

const MetricRow: React.FC<{
  label: string
  periods: FinancialPeriod[]
  getValue: (p: FinancialPeriod) => string
}> = ({ label, periods, getValue }) => (
  <tr className="hover:bg-gray-50">
    <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700 whitespace-nowrap">
      {label}
    </td>
    {periods.map((p) => (
      <td
        key={p.period}
        className="text-right px-3 py-2 border border-gray-200 text-gray-800 whitespace-nowrap"
      >
        {getValue(p)}
      </td>
    ))}
  </tr>
)

const commonLineOptions = {
  responsive: true,
  plugins: {
    legend: {
      position: 'top' as const,
    },
  },
  scales: {
    y: {
      ticks: {
        callback: (value: number | string) => {
          if (typeof value === 'number') {
            return value.toLocaleString('ja-JP')
          }
          return value
        },
      },
    },
  },
}

const FinancialCharts: React.FC<FinancialChartsProps> = ({ ticker }) => {
  const [activeTab, setActiveTab] = useState<PeriodTab>('annual')

  const { data, loading, error } = useFinancials(ticker, { periodType: activeTab })

  // 表示期間を最大5期に制限し、古い順に並べ直す（チャート用）
  const displayPeriods = [...data].slice(0, 5).reverse()
  const labels = displayPeriods.map((p) => formatPeriod(p.period))

  // 売上高・営業利益・純利益 折れ線チャートデータ
  const incomeChartData = {
    labels,
    datasets: [
      {
        label: '売上高（百万円）',
        data: displayPeriods.map((p) => p.revenue),
        borderColor: COLOR_REVENUE,
        backgroundColor: COLOR_REVENUE,
        tension: 0.3,
      },
      {
        label: '営業利益（百万円）',
        data: displayPeriods.map((p) => p.operating_income),
        borderColor: COLOR_OPERATING_INCOME,
        backgroundColor: COLOR_OPERATING_INCOME,
        tension: 0.3,
      },
      {
        label: '純利益（百万円）',
        data: displayPeriods.map((p) => p.net_income),
        borderColor: COLOR_NET_INCOME,
        backgroundColor: COLOR_NET_INCOME,
        tension: 0.3,
      },
    ],
  }

  // 営業利益率・ROE・ROA 折れ線チャートデータ
  const ratioChartData = {
    labels,
    datasets: [
      {
        label: '営業利益率（%）',
        data: displayPeriods.map((p) =>
          p.revenue > 0 ? Math.round((p.operating_income / p.revenue) * 1000) / 10 : null
        ),
        borderColor: COLOR_OPERATING_INCOME,
        backgroundColor: COLOR_OPERATING_INCOME,
        tension: 0.3,
      },
      {
        label: 'ROE（%）',
        data: displayPeriods.map((p) => p.roe),
        borderColor: COLOR_NET_INCOME,
        backgroundColor: COLOR_NET_INCOME,
        tension: 0.3,
      },
      {
        label: 'ROA（%）',
        data: displayPeriods.map((p) => p.roa),
        borderColor: COLOR_REVENUE,
        backgroundColor: COLOR_REVENUE,
        tension: 0.3,
      },
    ],
  }

  const ratioOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number | string) => {
            if (typeof value === 'number') {
              return `${value}%`
            }
            return value
          },
        },
      },
    },
  }

  // キャッシュフロー棒グラフデータ
  const cashflowChartData = {
    labels,
    datasets: [
      {
        label: '営業CF（百万円）',
        data: displayPeriods.map((p) => p.operating_cf),
        backgroundColor: COLOR_OPERATING_CF,
      },
      {
        label: '投資CF（百万円）',
        data: displayPeriods.map((p) => p.investing_cf),
        backgroundColor: COLOR_INVESTING_CF,
      },
      {
        label: '財務CF（百万円）',
        data: displayPeriods.map((p) => p.financing_cf),
        backgroundColor: COLOR_FINANCING_CF,
      },
    ],
  }

  const cashflowOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number | string) => {
            if (typeof value === 'number') {
              return value.toLocaleString('ja-JP')
            }
            return value
          },
        },
      },
    },
  }

  return (
    <div className="space-y-6">
      {/* タブ切り替え */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('annual')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'annual'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          年次
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('quarterly')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'quarterly'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          四半期
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">データの取得に失敗しました: {error.message}</p>
        </div>
      )}

      {/* 売上高・営業利益・純利益チャート */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-base font-semibold text-gray-800 mb-4">損益推移（百万円）</h3>
        {loading ? (
          <ChartSkeleton />
        ) : displayPeriods.length === 0 ? (
          <NoData />
        ) : (
          <Line data={incomeChartData} options={commonLineOptions} />
        )}
      </div>

      {/* 収益性指標チャート */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-base font-semibold text-gray-800 mb-4">収益性指標推移（%）</h3>
        {loading ? (
          <ChartSkeleton />
        ) : displayPeriods.length === 0 ? (
          <NoData />
        ) : (
          <Line data={ratioChartData} options={ratioOptions} />
        )}
      </div>

      {/* キャッシュフローチャート */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-base font-semibold text-gray-800 mb-4">
          キャッシュフロー推移（百万円）
        </h3>
        {loading ? (
          <ChartSkeleton />
        ) : displayPeriods.length === 0 ? (
          <NoData />
        ) : (
          <Bar data={cashflowChartData} options={cashflowOptions} />
        )}
      </div>

      {/* 主要指標サマリーテーブル */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-base font-semibold text-gray-800 mb-4">主要財務指標サマリー</h3>
        {loading ? (
          <div className="animate-pulse space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-200 rounded" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <NoData />
        ) : (
          <SummaryTable periods={data} />
        )}
      </div>
    </div>
  )
}

export default FinancialCharts
