import { describe, it, expect } from 'vitest'
import { formatMillionYen, formatPercent, formatPeriod } from './formatters'

describe('formatMillionYen', () => {
  it('formats positive integer', () => {
    expect(formatMillionYen(1000)).toBe('1,000百万円')
  })

  it('formats large number with commas', () => {
    expect(formatMillionYen(1234567)).toBe('1,234,567百万円')
  })

  it('formats zero', () => {
    expect(formatMillionYen(0)).toBe('0百万円')
  })

  it('formats negative number', () => {
    expect(formatMillionYen(-500)).toBe('-500百万円')
  })

  it('returns "-" for null', () => {
    expect(formatMillionYen(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatMillionYen(undefined)).toBe('-')
  })

  it('formats decimal number', () => {
    expect(formatMillionYen(1000.5)).toBe('1,000.5百万円')
  })
})

describe('formatPercent', () => {
  it('formats with default 1 decimal place', () => {
    expect(formatPercent(12.345)).toBe('12.3%')
  })

  it('formats with specified decimal places', () => {
    expect(formatPercent(12.345, 2)).toBe('12.35%')
  })

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('formats negative value', () => {
    expect(formatPercent(-3.7)).toBe('-3.7%')
  })

  it('returns "-" for null', () => {
    expect(formatPercent(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatPercent(undefined)).toBe('-')
  })

  it('formats 0 decimals', () => {
    expect(formatPercent(75.6, 0)).toBe('76%')
  })
})

describe('formatPeriod', () => {
  it('converts "2024-03" to "2024年3月期"', () => {
    expect(formatPeriod('2024-03')).toBe('2024年3月期')
  })

  it('converts "2025-12" to "2025年12月期"', () => {
    expect(formatPeriod('2025-12')).toBe('2025年12月期')
  })

  it('strips leading zero from month', () => {
    expect(formatPeriod('2023-01')).toBe('2023年1月期')
  })

  it('handles quarterly suffix', () => {
    expect(formatPeriod('2024-12-Q3')).toBe('2024年12月期')
  })

  it('returns input as-is if format does not match', () => {
    expect(formatPeriod('invalid')).toBe('invalid')
  })

  it('returns input as-is for empty string', () => {
    expect(formatPeriod('')).toBe('')
  })
})
