import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { CompanyMeta } from '@/types'

const MARKET_BADGE: Record<
  CompanyMeta['listing_market'],
  { bg: string; text: string }
> = {
  プライム: { bg: 'bg-blue-100', text: 'text-blue-700' },
  スタンダード: { bg: 'bg-gray-100', text: 'text-gray-600' },
  グロース: { bg: 'bg-green-100', text: 'text-green-700' },
}

const CompanySearch: React.FC = () => {
  const navigate = useNavigate()
  const [tickerInput, setTickerInput] = useState('')
  const [tickerError, setTickerError] = useState('')
  const [recentCompanies, setRecentCompanies] = useState<CompanyMeta[]>([])
  const [listLoading, setListLoading] = useState(true)

  // 収集済み企業リストをFirestoreから取得
  useEffect(() => {
    const fetchCompanies = async (): Promise<void> => {
      try {
        setListLoading(true)
        const colRef = collection(db, 'companies')
        const q = query(colRef, orderBy('collected_at', 'desc'), limit(20))
        const snapshot = await getDocs(q)
        const companies = snapshot.docs.map((d) => d.data() as CompanyMeta)
        setRecentCompanies(companies)
      } catch (err) {
        console.error('Failed to fetch companies:', err)
      } finally {
        setListLoading(false)
      }
    }

    void fetchCompanies()
  }, [])

  const validateTicker = (value: string): string => {
    if (value.length === 0) return '証券コードを入力してください'
    if (!/^\d{4}$/.test(value)) return '4桁の数字で入力してください'
    return ''
  }

  const handleSearch = (): void => {
    const error = validateTicker(tickerInput)
    if (error) {
      setTickerError(error)
      return
    }
    navigate(`/company/${tickerInput}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleTickerChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4)
    setTickerInput(value)
    if (tickerError) setTickerError('')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-8">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">企業検索</h1>
        <p className="text-sm text-gray-500 mt-1">
          証券コードを入力して企業ダッシュボードを表示します
        </p>
      </div>

      {/* 検索フォーム */}
      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div>
          <label
            htmlFor="ticker-input"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            証券コード（4桁）
          </label>
          <div className="flex gap-3">
            <input
              id="ticker-input"
              type="text"
              inputMode="numeric"
              value={tickerInput}
              onChange={handleTickerChange}
              onKeyDown={handleKeyDown}
              placeholder="例: 7203"
              className={`flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                tickerError
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-gray-300'
              }`}
              maxLength={4}
            />
            <button
              onClick={handleSearch}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              検索
            </button>
          </div>
          {tickerError && (
            <p className="text-xs text-red-500 mt-1">{tickerError}</p>
          )}
        </div>
      </div>

      {/* データ収集のガイド */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-2">
        <h2 className="text-sm font-semibold text-amber-800">
          データ収集について
        </h2>
        <p className="text-sm text-amber-700">
          初回利用時は GitHub Actions でデータを収集してください。
          以下のURLからワークフローを手動トリガーできます。
        </p>
        <p className="text-xs font-mono text-amber-600 bg-amber-100 rounded px-3 py-2 break-all select-all">
          https://github.com/[your-org]/enterprise-intelligence-hub/actions/workflows/collect.yml
        </p>
        <p className="text-xs text-amber-600">
          ワークフロー実行時に <code className="font-mono">ticker</code>{' '}
          パラメータへ4桁の証券コードを入力してください。
        </p>
      </div>

      {/* 収集済み企業リスト */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          収集済み企業 （最新20件）
        </h2>

        {listLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-14 bg-gray-100 rounded-lg"
              />
            ))}
          </div>
        ) : recentCompanies.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400 text-sm">
            収集済みの企業データがありません。
            <br />
            GitHub Actions でデータを収集してください。
          </div>
        ) : (
          <ul className="space-y-2">
            {recentCompanies.map((company) => {
              const badge = MARKET_BADGE[company.listing_market]
              return (
                <li key={company.ticker}>
                  <button
                    onClick={() => navigate(`/company/${company.ticker}`)}
                    className="w-full bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-4 hover:border-blue-400 hover:shadow-sm transition-all text-left"
                  >
                    <span className="font-mono text-sm font-semibold text-gray-800 w-12 shrink-0">
                      {company.ticker}
                    </span>
                    <span className="text-sm font-medium text-gray-900 flex-1 truncate">
                      {company.company_name}
                    </span>
                    <span className="text-xs text-gray-500 truncate hidden sm:block">
                      {company.sector_name}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.bg} ${badge.text}`}
                    >
                      {company.listing_market}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default CompanySearch
