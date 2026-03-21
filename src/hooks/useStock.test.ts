import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStock } from './useStock'

vi.mock('@/lib/firebase', () => ({ db: {} }))

const mockUnsubscribe = vi.fn()
let capturedOnNext: ((snapshot: unknown) => void) | null = null
let capturedOnError: ((err: Error) => void) | null = null

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'docRef'),
  onSnapshot: vi.fn((_ref, onNext, onError) => {
    capturedOnNext = onNext
    capturedOnError = onError
    return mockUnsubscribe
  }),
}))

const makeSnapshot = (exists: boolean, data?: Record<string, unknown>) => ({
  exists: () => exists,
  data: () => data ?? {},
})

const sampleStockData = {
  daily: [{ date: '2024-03-15', open: 100, high: 105, low: 98, close: 102, volume: 1000000 }],
  derived: {
    per: 15.2,
    pbr: 1.3,
    market_cap: 500000,
    dividend_yield: 2.1,
    ma_50: 99.5,
    ma_200: 95.0,
    volatility_30d: 0.18,
  },
  collected_at: null,
  schema_version: '1.0.0',
}

describe('useStock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnNext = null
    capturedOnError = null
  })

  it('returns null data and loading=false when ticker is null', () => {
    const { result } = renderHook(() => useStock(null))
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets loading=true immediately after ticker is provided', () => {
    const { result } = renderHook(() => useStock('7203'))
    expect(result.current.loading).toBe(true)
  })

  it('sets data when document exists', () => {
    const { result } = renderHook(() => useStock('7203'))

    act(() => {
      capturedOnNext!(makeSnapshot(true, sampleStockData))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toEqual(sampleStockData)
    expect(result.current.data!.derived.per).toBe(15.2)
  })

  it('sets data to null when document does not exist', () => {
    const { result } = renderHook(() => useStock('9999'))

    act(() => {
      capturedOnNext!(makeSnapshot(false))
    })

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('sets error on snapshot failure', () => {
    const { result } = renderHook(() => useStock('7203'))
    const err = new Error('network error')

    act(() => {
      capturedOnError!(err)
    })

    expect(result.current.error).toBe(err)
    expect(result.current.loading).toBe(false)
  })

  it('calls unsubscribe on unmount', () => {
    const { unmount } = renderHook(() => useStock('7203'))
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledOnce()
  })

  it('resets data when ticker becomes null', () => {
    let ticker: string | null = '7203'
    const { result, rerender } = renderHook(() => useStock(ticker))

    act(() => {
      capturedOnNext!(makeSnapshot(true, sampleStockData))
    })
    expect(result.current.data).not.toBeNull()

    ticker = null
    rerender()
    expect(result.current.data).toBeNull()
  })
})
