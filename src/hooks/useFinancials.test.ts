import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFinancials } from './useFinancials'

// Mock Firebase Firestore
vi.mock('@/lib/firebase', () => ({ db: {} }))

const mockUnsubscribe = vi.fn()
let capturedOnNext: ((snapshot: unknown) => void) | null = null
let capturedOnError: ((err: Error) => void) | null = null

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'colRef'),
  query: vi.fn((_col, ..._args) => 'queryRef'),
  orderBy: vi.fn(() => 'orderByClause'),
  onSnapshot: vi.fn((_query, onNext, onError) => {
    capturedOnNext = onNext
    capturedOnError = onError
    return mockUnsubscribe
  }),
}))

const makeDoc = (data: Record<string, unknown>) => ({
  data: () => data,
})

const makeSnapshot = (docs: ReturnType<typeof makeDoc>[]) => ({ docs })

describe('useFinancials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnNext = null
    capturedOnError = null
  })

  it('returns empty data and loading=false when ticker is null', () => {
    const { result } = renderHook(() => useFinancials(null))
    expect(result.current.data).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets loading=true immediately after ticker is provided', () => {
    const { result } = renderHook(() => useFinancials('7203'))
    expect(result.current.loading).toBe(true)
  })

  it('populates data on snapshot and sets loading=false', () => {
    const { result } = renderHook(() => useFinancials('7203'))

    act(() => {
      capturedOnNext!(
        makeSnapshot([
          makeDoc({ period: '2024-03', period_type: 'annual', revenue: 100000 }),
          makeDoc({ period: '2023-03', period_type: 'annual', revenue: 90000 }),
        ])
      )
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data[0].period).toBe('2024-03')
  })

  it('filters by periodType when option is provided', () => {
    const { result } = renderHook(() => useFinancials('7203', { periodType: 'annual' }))

    act(() => {
      capturedOnNext!(
        makeSnapshot([
          makeDoc({ period: '2024-03', period_type: 'annual', revenue: 100000 }),
          makeDoc({ period: '2024-06-Q1', period_type: 'quarterly', revenue: 25000 }),
        ])
      )
    })

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0].period_type).toBe('annual')
  })

  it('sets error on snapshot failure', () => {
    const { result } = renderHook(() => useFinancials('7203'))
    const err = new Error('permission denied')

    act(() => {
      capturedOnError!(err)
    })

    expect(result.current.error).toBe(err)
    expect(result.current.loading).toBe(false)
  })

  it('returns unsubscribe function on unmount', () => {
    const { unmount } = renderHook(() => useFinancials('7203'))
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledOnce()
  })

  it('resets to empty data when ticker becomes null', () => {
    let ticker: string | null = '7203'
    const { result, rerender } = renderHook(() => useFinancials(ticker))

    act(() => {
      capturedOnNext!(makeSnapshot([makeDoc({ period: '2024-03', period_type: 'annual' })]))
    })
    expect(result.current.data).toHaveLength(1)

    ticker = null
    rerender()
    expect(result.current.data).toEqual([])
  })
})
