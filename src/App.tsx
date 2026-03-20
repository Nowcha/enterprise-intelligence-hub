import React from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useParams,
  Link,
} from 'react-router-dom'
import GovernanceView from '@/components/GovernanceView'
import FinancialCharts from '@/components/FinancialCharts'
import CompetitorBenchmark from '@/components/CompetitorBenchmark'
import NewsTimeline from '@/components/NewsTimeline'
import { AISummaryCard } from '@/components/Dashboard'
import Dashboard from '@/components/Dashboard'
import CompanySearch from '@/components/CompanySearch'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useCompany } from '@/hooks/useCompany'

// ナビゲーションリンクのスタイル
const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  `py-3 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
    isActive
      ? 'border-blue-600 text-blue-600'
      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
  }`

// 企業ページ内のレイアウト（ナビタブ付き）
const CompanyLayout: React.FC = () => {
  const { ticker } = useParams<{ ticker: string }>()
  const safeTicker = ticker ?? ''

  const { data: company } = useCompany(safeTicker)
  const { data: analysisData, loading: analysisLoading } = useAnalysis(safeTicker)

  const tabs = [
    { path: `/company/${safeTicker}`, label: 'ダッシュボード', exact: true },
    { path: `/company/${safeTicker}/summary`, label: 'AI分析' },
    { path: `/company/${safeTicker}/financials`, label: '財務分析' },
    { path: `/company/${safeTicker}/governance`, label: 'ガバナンス' },
    { path: `/company/${safeTicker}/competitors`, label: '競合比較' },
    { path: `/company/${safeTicker}/news`, label: 'ニュース' },
  ]

  return (
    <>
      {/* 企業情報サブヘッダー */}
      <div className="bg-white border-b border-gray-200 px-6 py-2">
        <p className="text-sm text-gray-500">
          <span className="font-mono font-semibold text-gray-700">{safeTicker}</span>
          {company?.company_name && (
            <span className="ml-2 text-gray-700">{company.company_name}</span>
          )}
          {company?.sector_name && (
            <span className="ml-2 text-xs text-gray-400">{company.sector_name}</span>
          )}
        </p>
      </div>

      {/* タブナビゲーション */}
      <nav className="bg-white border-b border-gray-200 px-6 sticky top-[65px] z-10">
        <div className="flex space-x-6 max-w-7xl mx-auto overflow-x-auto">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.exact}
              className={navLinkClass}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* コンテンツ */}
      <main className="p-6 max-w-7xl mx-auto">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route
            path="summary"
            element={
              <AISummaryCard
                summary={analysisData.summary}
                loading={analysisLoading}
              />
            }
          />
          <Route path="financials" element={<FinancialCharts ticker={safeTicker} />} />
          <Route path="governance" element={<GovernanceView ticker={safeTicker} />} />
          <Route path="competitors" element={<CompetitorBenchmark ticker={safeTicker} />} />
          <Route path="news" element={<NewsTimeline ticker={safeTicker} />} />
          {/* パスが一致しない場合はダッシュボードにリダイレクト */}
          <Route path="*" element={<Navigate to={`/company/${safeTicker}`} replace />} />
        </Routes>
      </main>
    </>
  )
}

// アプリルート
const App: React.FC = () => {
  return (
    <BrowserRouter basename="/enterprise-intelligence-hub">
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* グローバルヘッダー */}
        <header className="bg-navy-900 text-white py-4 px-6 shadow-lg sticky top-0 z-20">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <h1 className="text-xl font-bold leading-tight">
                Enterprise Intelligence Hub
              </h1>
              <p className="text-xs text-navy-200 mt-0.5">
                経営コンサルティング支援ツール
              </p>
            </Link>
          </div>
        </header>

        {/* ルーティング */}
        <div className="flex-1">
          <Routes>
            {/* トップ: 企業検索 */}
            <Route
              path="/"
              element={
                <main className="p-6 max-w-7xl mx-auto">
                  <CompanySearch />
                </main>
              }
            />

            {/* 企業ページ（ネスト） */}
            <Route path="/company/:ticker/*" element={<CompanyLayout />} />

            {/* フォールバック */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
