import type { Timestamp } from 'firebase/firestore'

export interface CompanyMeta {
  edinet_code: string
  ticker: string
  company_name: string
  company_name_en: string | null
  sector_code_33: string
  sector_name: string
  listing_market: 'プライム' | 'スタンダード' | 'グロース'
  founded_date: string | null
  employee_count: number | null
  fiscal_year_end: string
  website_url: string | null
  ir_url: string | null
  description: string | null
  collected_at: Timestamp
  schema_version: string
}

export interface Segment {
  name: string
  revenue: number
  operating_income: number | null
}

export interface FinancialPeriod {
  period: string
  period_type: 'annual' | 'quarterly'
  revenue: number
  operating_income: number
  ordinary_income: number
  net_income: number
  total_assets: number
  net_assets: number
  equity_ratio: number
  roe: number | null
  roa: number | null
  operating_cf: number | null
  investing_cf: number | null
  financing_cf: number | null
  eps: number | null
  dividend_per_share: number | null
  segments: Segment[]
  data_source: 'xbrl' | 'pdf_extraction' | 'yfinance'
  collected_at: Timestamp
  schema_version: string
}

export interface BoardMember {
  name: string
  role: string
  is_outside: boolean
  is_independent: boolean
  career_summary: string | null
  appointment_year: number | null
}

export interface Committee {
  name: string
  exists: boolean
  chair_name: string | null
  member_count: number | null
}

export interface Shareholder {
  name: string
  shares_held: number
  ownership_ratio: number
}

export interface CrossShareholder {
  company_name: string
  ticker: string | null
  shares_held: number
  book_value: number | null
  purpose: string | null
}

export interface GovernanceData {
  board_members: BoardMember[]
  outside_director_ratio: number
  committees: Committee[]
  executive_compensation: {
    fixed_ratio: number
    variable_ratio: number
    total_amount: number | null
  }
  major_shareholders: Shareholder[]
  cross_shareholdings: CrossShareholder[]
  cg_report_url: string | null
  collected_at: Timestamp
  schema_version: string
}

export interface CompetitorEntry {
  ticker: string
  company_name: string
  reason: string
}

export interface BenchmarkEntry {
  ticker: string
  company_name: string
  revenue: number
  operating_margin: number
  roe: number | null
  per: number | null
  pbr: number | null
  market_cap: number | null
}

export interface CompetitorData {
  target_ticker: string
  estimated_competitors: CompetitorEntry[]
  manual_competitors: CompetitorEntry[]
  benchmark_data: BenchmarkEntry[]
  estimation_method: string
  collected_at: Timestamp
  schema_version: string
}

export interface NewsArticle {
  title: string
  url: string
  source: string
  // Google News RSS stores this as an ISO string; Firestore-native sources use Timestamp.
  published_at: Timestamp | string
  summary: string | null
  collected_at: Timestamp
  schema_version: string
}

export interface DailyPrice {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface StockData {
  daily: DailyPrice[]
  derived: {
    per: number | null
    pbr: number | null
    market_cap: number | null
    dividend_yield: number | null
    ma_50: number | null
    ma_200: number | null
    volatility_30d: number | null
  }
  collected_at: Timestamp
  schema_version: string
}

export type FinancialTrend = 'improving' | 'stable' | 'declining'
export type GovernanceRating = 1 | 2 | 3 | 4 | 5

export interface AnalysisSummary {
  company_profile: string
  governance_score: {
    rating: GovernanceRating
    comment: string
  }
  financial_highlights: {
    trend: FinancialTrend
    key_metrics: Record<string, number>
    comment: string
  }
  competitive_position: string
  risks: string[]
  opportunities: string[]
  consulting_suggestions: string[]
  analyzed_at: Timestamp
  schema_version: string
}
