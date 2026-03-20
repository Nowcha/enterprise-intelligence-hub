import React, { useState, useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useNews } from '@/hooks/useNews'
import type { NewsArticle } from '@/types'

interface NewsTimelineProps {
  ticker: string
}

type SourceFilter = 'all' | 'google_news' | 'ir_page'

const PAGE_SIZE = 50

function toDate(value: Timestamp | string | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Timestamp) return value.toDate()
  const d = new Date(value as string)
  return isNaN(d.getTime()) ? null : d
}

function formatDate(value: Timestamp | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return '-'
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${mo}/${day} ${h}:${min}`
}

function isNew(value: Timestamp | string | null | undefined): boolean {
  const d = toDate(value)
  if (!d) return false
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  return diffMs < 24 * 60 * 60 * 1000
}

function normalizeSource(source: string): SourceFilter | string {
  if (source === 'google_news') return 'google_news'
  if (source === 'ir_page') return 'ir_page'
  return source
}

function sourceLabel(source: string): string {
  if (source === 'google_news') return 'Google News'
  if (source === 'ir_page') return 'IRページ'
  return source
}

const SkeletonCard: React.FC = () => (
  <div className="flex gap-4 py-4 border-b border-gray-100 last:border-0 animate-pulse">
    <div className="flex flex-col items-center gap-1 w-24 shrink-0">
      <div className="h-3 w-20 bg-gray-200 rounded" />
      <div className="h-3 w-16 bg-gray-200 rounded" />
    </div>
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-100 rounded w-1/4" />
    </div>
  </div>
)

const NewsTimeline: React.FC<NewsTimelineProps> = ({ ticker }) => {
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')

  const { data: allArticles, loading, error } = useNews(ticker, { limitCount: 200 })

  // Collect distinct non-standard sources for tab labels
  const extraSources = useMemo(() => {
    const sources = new Set<string>()
    allArticles.forEach((a) => {
      const s = normalizeSource(a.source)
      if (s !== 'google_news' && s !== 'ir_page') {
        sources.add(a.source)
      }
    })
    return Array.from(sources)
  }, [allArticles])

  const filteredArticles = useMemo(() => {
    if (sourceFilter === 'all') return allArticles
    return allArticles.filter((a) => {
      if (sourceFilter === 'google_news') return a.source === 'google_news'
      if (sourceFilter === 'ir_page') return a.source === 'ir_page'
      return a.source === sourceFilter
    })
  }, [allArticles, sourceFilter])

  const visibleArticles = filteredArticles.slice(0, displayLimit)
  const hasMore = filteredArticles.length > displayLimit

  const loadMore = () => setDisplayLimit((prev) => prev + PAGE_SIZE)

  const tabClass = (active: boolean) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      active
        ? 'border-navy-900 text-navy-900'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-medium">ニュースデータの読み込みに失敗しました</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-navy-900">業界トレンド・ニュース</h2>
        {!loading && (
          <span className="text-sm text-gray-500">{allArticles.length}件</span>
        )}
      </div>

      {/* Source filter tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-200 px-4">
          <button
            className={tabClass(sourceFilter === 'all')}
            onClick={() => {
              setSourceFilter('all')
              setDisplayLimit(PAGE_SIZE)
            }}
          >
            すべて
          </button>
          <button
            className={tabClass(sourceFilter === 'google_news')}
            onClick={() => {
              setSourceFilter('google_news')
              setDisplayLimit(PAGE_SIZE)
            }}
          >
            Google News
          </button>
          <button
            className={tabClass(sourceFilter === 'ir_page')}
            onClick={() => {
              setSourceFilter('ir_page')
              setDisplayLimit(PAGE_SIZE)
            }}
          >
            IRページ
          </button>
          {extraSources.map((src) => (
            <button
              key={src}
              className={tabClass(sourceFilter === src)}
              onClick={() => {
                setSourceFilter(src as SourceFilter)
                setDisplayLimit(PAGE_SIZE)
              }}
            >
              {src}
            </button>
          ))}
        </div>

        {/* Timeline */}
        <div className="p-4">
          {loading ? (
            <div className="space-y-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : visibleArticles.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500">ニュース記事がありません</p>
              <p className="text-gray-400 text-sm mt-1">
                データ収集後に記事が表示されます
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[104px] top-0 bottom-0 w-px bg-gray-200 pointer-events-none" />

              <div className="space-y-0">
                {visibleArticles.map((article, index) =>
                  renderArticle(article, index, ticker)
                )}
              </div>
            </div>
          )}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="mt-4 text-center">
              <button
                onClick={loadMore}
                className="px-6 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                さらに{Math.min(PAGE_SIZE, filteredArticles.length - displayLimit)}件を表示
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function renderArticle(
  article: NewsArticle,
  _index: number,
  _ticker: string
): React.ReactElement {
  const publishedDate = toDate(article.published_at)
  const isNewArticle = isNew(article.published_at)

  return (
    <div
      key={`${article.url}-${_index}`}
      className="flex gap-4 py-4 border-b border-gray-50 last:border-0 group"
    >
      {/* Date column */}
      <div className="flex flex-col items-end w-24 shrink-0 pt-0.5">
        <span className="text-xs text-gray-400 leading-tight">
          {publishedDate
            ? (() => {
                const y = publishedDate.getFullYear()
                const mo = String(publishedDate.getMonth() + 1).padStart(2, '0')
                const day = String(publishedDate.getDate()).padStart(2, '0')
                return `${y}/${mo}/${day}`
              })()
            : '-'}
        </span>
        <span className="text-xs text-gray-400 leading-tight">
          {publishedDate
            ? (() => {
                const h = String(publishedDate.getHours()).padStart(2, '0')
                const min = String(publishedDate.getMinutes()).padStart(2, '0')
                return `${h}:${min}`
              })()
            : ''}
        </span>
      </div>

      {/* Dot on timeline */}
      <div className="flex items-start pt-1.5 shrink-0" style={{ width: '12px' }}>
        <div
          className={`w-2.5 h-2.5 rounded-full border-2 ${
            isNewArticle
              ? 'bg-blue-500 border-blue-500'
              : 'bg-white border-gray-300 group-hover:border-navy-400'
          } transition-colors`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          {isNewArticle && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-500 text-white shrink-0">
              NEW
            </span>
          )}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-gray-900 hover:text-navy-700 hover:underline line-clamp-2 transition-colors"
          >
            {article.title}
          </a>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">{sourceLabel(article.source)}</span>
          {article.summary && (
            <span className="text-xs text-gray-500 line-clamp-1">{article.summary}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// Attach formatDate to make it available (used in tests if needed)
export { formatDate }

export default NewsTimeline
