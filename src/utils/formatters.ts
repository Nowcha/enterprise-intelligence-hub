/**
 * Format number as million yen with comma separators
 */
export const formatMillionYen = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-'
  return `${value.toLocaleString('ja-JP')}百万円`
}

/**
 * Format percentage
 */
export const formatPercent = (value: number | null | undefined, decimals = 1): string => {
  if (value === null || value === undefined) return '-'
  return `${value.toFixed(decimals)}%`
}

/**
 * Format period string "2024-03" → "2024年3月期"
 */
export const formatPeriod = (period: string): string => {
  const match = period.match(/^(\d{4})-(\d{2})/)
  if (!match) return period
  const year = match[1]
  const month = parseInt(match[2], 10)
  return `${year}年${month}月期`
}
