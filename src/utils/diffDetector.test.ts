import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  detectFinancialChanges,
  detectGovernanceChanges,
  isRecentArticle,
} from './diffDetector'
import type { FinancialPeriod, GovernanceData, BoardMember } from '@/types'

// FinancialPeriod test fixture (Timestamp fields are not exercised in these tests)
const makeFinancial = (overrides: Partial<FinancialPeriod>): FinancialPeriod => ({
  period: '2024-03',
  period_type: 'annual',
  revenue: 100000,
  operating_income: 10000,
  ordinary_income: 9500,
  net_income: 6000,
  total_assets: 200000,
  net_assets: 80000,
  equity_ratio: 40,
  roe: 7.5,
  roa: 3.0,
  operating_cf: null,
  investing_cf: null,
  financing_cf: null,
  eps: null,
  dividend_per_share: null,
  segments: [],
  data_source: 'yfinance',
  collected_at: null as never,
  schema_version: '1.0.0',
  ...overrides,
})

const makeBoardMember = (overrides: Partial<BoardMember>): BoardMember => ({
  name: '山田 太郎',
  role: '代表取締役',
  is_outside: false,
  is_independent: false,
  career_summary: null,
  appointment_year: null,
  ...overrides,
})

const makeGovernance = (members: BoardMember[]): GovernanceData => ({
  board_members: members,
  outside_director_ratio: 33.3,
  committees: [],
  executive_compensation: { fixed_ratio: 70, variable_ratio: 30, total_amount: null },
  major_shareholders: [],
  cross_shareholdings: [],
  cg_report_url: null,
  collected_at: null as never,
  schema_version: '1.0.0',
})

// ────────────────────────────────────────────
// detectFinancialChanges
// ────────────────────────────────────────────
describe('detectFinancialChanges', () => {
  it('returns empty array when both periods are null', () => {
    expect(detectFinancialChanges(null, null)).toEqual([])
  })

  it('returns empty array when previous is null', () => {
    expect(detectFinancialChanges(null, makeFinancial({}))).toEqual([])
  })

  it('returns empty array when current is null', () => {
    expect(detectFinancialChanges(makeFinancial({}), null)).toEqual([])
  })

  it('detects revenue increase', () => {
    const prev = makeFinancial({ revenue: 100000 })
    const curr = makeFinancial({ revenue: 110000 })
    const changes = detectFinancialChanges(prev, curr)
    const revenueChange = changes.find((c) => c.field === 'revenue')
    expect(revenueChange).toBeDefined()
    expect(revenueChange!.direction).toBe('up')
    expect(revenueChange!.changePercent).toBe(10)
    expect(revenueChange!.isSignificant).toBe(true)
  })

  it('detects revenue decrease', () => {
    const prev = makeFinancial({ revenue: 100000 })
    const curr = makeFinancial({ revenue: 90000 })
    const changes = detectFinancialChanges(prev, curr)
    const revenueChange = changes.find((c) => c.field === 'revenue')
    expect(revenueChange!.direction).toBe('down')
    expect(revenueChange!.changePercent).toBe(-10)
  })

  it('marks change as significant when ≥5%', () => {
    const prev = makeFinancial({ revenue: 100000 })
    const curr = makeFinancial({ revenue: 105000 })
    const changes = detectFinancialChanges(prev, curr)
    expect(changes.find((c) => c.field === 'revenue')!.isSignificant).toBe(true)
  })

  it('marks change as not significant when <5%', () => {
    const prev = makeFinancial({ revenue: 100000 })
    const curr = makeFinancial({ revenue: 103000 })
    const changes = detectFinancialChanges(prev, curr)
    expect(changes.find((c) => c.field === 'revenue')!.isSignificant).toBe(false)
  })

  it('skips field when previous value is 0 (division guard)', () => {
    const prev = makeFinancial({ revenue: 0 })
    const curr = makeFinancial({ revenue: 50000 })
    const changes = detectFinancialChanges(prev, curr)
    expect(changes.find((c) => c.field === 'revenue')).toBeUndefined()
  })

  it('skips null fields', () => {
    const prev = makeFinancial({ roe: null })
    const curr = makeFinancial({ roe: 10 })
    const changes = detectFinancialChanges(prev, curr)
    expect(changes.find((c) => c.field === 'roe')).toBeUndefined()
  })

  it('detects unchanged direction when values are equal', () => {
    const prev = makeFinancial({ revenue: 100000 })
    const curr = makeFinancial({ revenue: 100000 })
    const changes = detectFinancialChanges(prev, curr)
    const revenueChange = changes.find((c) => c.field === 'revenue')
    expect(revenueChange!.direction).toBe('unchanged')
    expect(revenueChange!.changePercent).toBe(0)
  })

  it('includes all 6 monitored fields when they all change', () => {
    const prev = makeFinancial({
      revenue: 100000, operating_income: 10000, net_income: 6000,
      total_assets: 200000, equity_ratio: 40, roe: 7.5,
    })
    const curr = makeFinancial({
      revenue: 110000, operating_income: 11000, net_income: 7000,
      total_assets: 210000, equity_ratio: 42, roe: 8.0,
    })
    const changes = detectFinancialChanges(prev, curr)
    expect(changes).toHaveLength(6)
  })
})

// ────────────────────────────────────────────
// detectGovernanceChanges
// ────────────────────────────────────────────
describe('detectGovernanceChanges', () => {
  it('returns empty array when both are null', () => {
    expect(detectGovernanceChanges(null, null)).toEqual([])
  })

  it('returns empty array when no changes', () => {
    const member = makeBoardMember({})
    const gov = makeGovernance([member])
    expect(detectGovernanceChanges(gov, gov)).toEqual([])
  })

  it('detects new member joined', () => {
    const member1 = makeBoardMember({ name: '山田 太郎' })
    const member2 = makeBoardMember({ name: '鈴木 花子', role: '社外取締役' })
    const prev = makeGovernance([member1])
    const curr = makeGovernance([member1, member2])
    const changes = detectGovernanceChanges(prev, curr)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('joined')
    expect(changes[0].member.name).toBe('鈴木 花子')
  })

  it('detects member left', () => {
    const member1 = makeBoardMember({ name: '山田 太郎' })
    const member2 = makeBoardMember({ name: '鈴木 花子' })
    const prev = makeGovernance([member1, member2])
    const curr = makeGovernance([member1])
    const changes = detectGovernanceChanges(prev, curr)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('left')
    expect(changes[0].member.name).toBe('鈴木 花子')
  })

  it('detects role change', () => {
    const prev = makeGovernance([makeBoardMember({ name: '山田 太郎', role: '取締役' })])
    const curr = makeGovernance([makeBoardMember({ name: '山田 太郎', role: '代表取締役' })])
    const changes = detectGovernanceChanges(prev, curr)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('role_changed')
    expect(changes[0].previousRole).toBe('取締役')
    expect(changes[0].member.role).toBe('代表取締役')
  })

  it('detects simultaneous join, leave, and role change', () => {
    const prev = makeGovernance([
      makeBoardMember({ name: '山田 太郎', role: '取締役' }),
      makeBoardMember({ name: '退任者', role: '監査役' }),
    ])
    const curr = makeGovernance([
      makeBoardMember({ name: '山田 太郎', role: '代表取締役' }),
      makeBoardMember({ name: '新任者', role: '社外取締役' }),
    ])
    const changes = detectGovernanceChanges(prev, curr)
    expect(changes).toHaveLength(3)
    expect(changes.map((c) => c.type).sort()).toEqual(['joined', 'left', 'role_changed'])
  })
})

// ────────────────────────────────────────────
// isRecentArticle
// ────────────────────────────────────────────
describe('isRecentArticle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for article published 1 hour ago', () => {
    expect(isRecentArticle(new Date('2024-03-15T11:00:00Z'))).toBe(true)
  })

  it('returns true for article published exactly 24 hours ago', () => {
    expect(isRecentArticle(new Date('2024-03-14T12:00:00Z'))).toBe(true)
  })

  it('returns false for article published 25 hours ago', () => {
    expect(isRecentArticle(new Date('2024-03-14T11:00:00Z'))).toBe(false)
  })

  it('accepts ISO string input', () => {
    expect(isRecentArticle('2024-03-15T11:00:00Z')).toBe(true)
  })

  it('returns false for old ISO string', () => {
    expect(isRecentArticle('2024-03-10T00:00:00Z')).toBe(false)
  })
})
