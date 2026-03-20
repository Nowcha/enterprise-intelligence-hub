import React, { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  LinearScale,
  CategoryScale,
} from 'chart.js'
import { Radar, Scatter } from 'react-chartjs-2'
import { useCompetitors } from '@/hooks/useCompetitors'
import { formatMillionYen, formatPercent } from '@/utils/formatters'
import type { BenchmarkEntry } from '@/types'

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  LinearScale,
  CategoryScale
)

interface CompetitorBenchmarkProps {
  ticker: string
}

// Normalize a value to 0–100 scale within the given array
function normalize(value: number | null, values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v !== null)
  if (valid.length === 0 || value === null) return 50
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  if (max === min) return 50
  return Math.round(((value - min) / (max - min)) * 100)
}

const RADAR_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.2)', border: 'rgb(59, 130, 246)' },
  { bg: 'rgba(239, 68, 68, 0.2)', border: 'rgb(239, 68, 68)' },
  { bg: 'rgba(34, 197, 94, 0.2)', border: 'rgb(34, 197, 94)' },
  { bg: 'rgba(234, 179, 8, 0.2)', border: 'rgb(234, 179, 8)' },
  { bg: 'rgba(168, 85, 247, 0.2)', border: 'rgb(168, 85, 247)' },
  { bg: 'rgba(249, 115, 22, 0.2)', border: 'rgb(249, 115, 22)' },
]

const SkeletonRow: React.FC = () => (
  <tr>
    {Array.from({ length: 7 }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-4 bg-gray-200 rounded animate-pulse" />
      </td>
    ))}
  </tr>
)

const CompetitorBenchmark: React.FC<CompetitorBenchmarkProps> = ({ ticker }) => {
  const { data, loading, error } = useCompetitors(ticker)
  const [addTickerInput, setAddTickerInput] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const allEntries: BenchmarkEntry[] = useMemo(() => {
    return data?.benchmark_data ?? []
  }, [data])

  // Build radar chart data normalising each axis
  const radarData = useMemo(() => {
    if (allEntries.length === 0) return null

    const revenues = allEntries.map((e) => e.revenue)
    const margins = allEntries.map((e) => e.operating_margin)
    const roes = allEntries.map((e) => e.roe)
    const pers = allEntries.map((e) => e.per)
    const caps = allEntries.map((e) => e.market_cap)

    const datasets = allEntries.map((entry, i) => {
      const color = RADAR_COLORS[i % RADAR_COLORS.length]
      return {
        label: entry.company_name,
        data: [
          normalize(entry.revenue, revenues),
          normalize(entry.operating_margin, margins),
          normalize(entry.roe, roes),
          normalize(entry.per ? 1 / entry.per : null, pers.map((p) => (p ? 1 / p : null))), // lower PER = better
          normalize(entry.market_cap, caps),
        ],
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 2,
        pointBackgroundColor: color.border,
      }
    })

    return {
      labels: ['売上高', '営業利益率', 'ROE', 'バリュエーション\n（割安度）', '時価総額'],
      datasets,
    }
  }, [allEntries])

  // Build scatter chart data
  const scatterData = useMemo(() => {
    if (allEntries.length === 0) return null

    const datasets = allEntries.map((entry, i) => {
      const isTarget = entry.ticker === ticker
      const color = isTarget ? 'rgb(27, 54, 93)' : RADAR_COLORS[i % RADAR_COLORS.length].border
      return {
        label: entry.company_name,
        data: [
          {
            x: entry.revenue,
            y: entry.operating_margin,
          },
        ],
        backgroundColor: color,
        pointRadius: isTarget ? 10 : 6,
        pointHoverRadius: isTarget ? 12 : 8,
      }
    })

    return { datasets }
  }, [allEntries, ticker])

  const handleAddCompetitor = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = addTickerInput.trim()
    if (!/^\d{4}$/.test(trimmed)) {
      setAddError('4桁の証券コードを入力してください')
      return
    }
    setAddError(null)
    // In a read-only frontend, we can only notify the user.
    // Actual write happens via GitHub Actions collector.
    alert(
      `証券コード ${trimmed} を手動競合として追加するには、GitHub Actions の collect.yml を実行してください。`
    )
    setAddTickerInput('')
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-6">
          <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-medium">競合データの読み込みに失敗しました</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    )
  }

  if (!data || allEntries.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">競合データがありません</p>
        <p className="text-gray-400 text-sm mt-2">
          データ収集後に競合比較が表示されます
        </p>
        <form onSubmit={handleAddCompetitor} className="mt-6 flex justify-center gap-2">
          <input
            type="text"
            value={addTickerInput}
            onChange={(e) => setAddTickerInput(e.target.value)}
            placeholder="証券コード（例: 7201）"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
          <button
            type="submit"
            className="bg-navy-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-navy-700 transition-colors"
          >
            競合を追加
          </button>
        </form>
        {addError && <p className="text-red-500 text-sm mt-2">{addError}</p>}
      </div>
    )
  }

  const estimatedCompetitors = data.estimated_competitors ?? []
  const manualCompetitors = data.manual_competitors ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-navy-900">競合比較</h2>
        <span className="text-sm text-gray-500">
          推定競合: {estimatedCompetitors.length}社 / 手動追加: {manualCompetitors.length}社
        </span>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        {radarData && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              総合競合ポジション（5軸レーダー）
            </h3>
            <Radar
              data={radarData}
              options={{
                responsive: true,
                scales: {
                  r: {
                    min: 0,
                    max: 100,
                    ticks: { stepSize: 25, font: { size: 10 } },
                    pointLabels: { font: { size: 11 } },
                  },
                },
                plugins: {
                  legend: { position: 'bottom', labels: { font: { size: 11 } } },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}pt`,
                    },
                  },
                },
              }}
            />
          </div>
        )}

        {/* Scatter Chart */}
        {scatterData && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              売上高 vs 営業利益率
            </h3>
            <Scatter
              data={scatterData}
              options={{
                responsive: true,
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: '売上高（百万円）',
                      font: { size: 11 },
                    },
                    ticks: { font: { size: 10 } },
                  },
                  y: {
                    title: {
                      display: true,
                      text: '営業利益率（%）',
                      font: { size: 11 },
                    },
                    ticks: { font: { size: 10 } },
                  },
                },
                plugins: {
                  legend: { position: 'bottom', labels: { font: { size: 11 } } },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const point = ctx.raw as { x: number; y: number }
                        return `${ctx.dataset.label}: 売上${formatMillionYen(point.x)} / 営業利益率${formatPercent(point.y)}`
                      },
                    },
                  },
                },
              }}
            />
          </div>
        )}
      </div>

      {/* Benchmark Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                企業名
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                売上高
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                営業利益率
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                ROE
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                PER
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                PBR
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                時価総額
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allEntries.map((entry) => {
              const isTarget = entry.ticker === ticker
              return (
                <tr
                  key={entry.ticker}
                  className={
                    isTarget
                      ? 'bg-navy-50 font-semibold'
                      : 'hover:bg-gray-50 transition-colors'
                  }
                >
                  <td className="px-4 py-3 text-gray-900">
                    <span className="flex items-center gap-2">
                      {isTarget && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-navy-900 text-white">
                          対象
                        </span>
                      )}
                      {entry.company_name}
                      <span className="text-gray-400 text-xs">({entry.ticker})</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {formatMillionYen(entry.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {formatPercent(entry.operating_margin)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {formatPercent(entry.roe)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {entry.per !== null ? `${entry.per.toFixed(1)}倍` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {entry.pbr !== null ? `${entry.pbr.toFixed(2)}倍` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {formatMillionYen(entry.market_cap)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add Competitor Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">競合企業を手動追加</h3>
        <form onSubmit={handleAddCompetitor} className="flex gap-3 items-start">
          <div className="flex flex-col gap-1">
            <input
              type="text"
              value={addTickerInput}
              onChange={(e) => setAddTickerInput(e.target.value)}
              placeholder="証券コード（例: 7201）"
              maxLength={4}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
            {addError && <p className="text-red-500 text-xs">{addError}</p>}
          </div>
          <button
            type="submit"
            className="bg-navy-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-navy-700 transition-colors whitespace-nowrap"
          >
            追加する
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">
          追加リクエストは GitHub Actions 収集ワークフローに反映されます
        </p>
      </div>

      {/* Competitor List */}
      {(estimatedCompetitors.length > 0 || manualCompetitors.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">競合企業一覧</h3>
          <div className="space-y-2">
            {estimatedCompetitors.map((comp) => (
              <div
                key={comp.ticker}
                className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0"
              >
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 shrink-0">
                  自動推定
                </span>
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {comp.company_name}
                  </span>
                  <span className="text-gray-400 text-xs ml-2">({comp.ticker})</span>
                  <p className="text-xs text-gray-500 mt-0.5">{comp.reason}</p>
                </div>
              </div>
            ))}
            {manualCompetitors.map((comp) => (
              <div
                key={comp.ticker}
                className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0"
              >
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 shrink-0">
                  手動追加
                </span>
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {comp.company_name}
                  </span>
                  <span className="text-gray-400 text-xs ml-2">({comp.ticker})</span>
                  {comp.reason && (
                    <p className="text-xs text-gray-500 mt-0.5">{comp.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default CompetitorBenchmark
