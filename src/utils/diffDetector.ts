import type { FinancialPeriod, GovernanceData, BoardMember } from '@/types'

export interface FinancialChange {
  field: string
  label: string
  previousValue: number
  currentValue: number
  changePercent: number
  isSignificant: boolean // ±5%以上
  direction: 'up' | 'down' | 'unchanged'
}

export interface GovernanceChange {
  type: 'joined' | 'left' | 'role_changed'
  member: BoardMember
  previousRole?: string
}

/**
 * Detect significant financial changes between two periods.
 * Flags changes of ±5% or more as significant.
 */
export const detectFinancialChanges = (
  previous: FinancialPeriod | null,
  current: FinancialPeriod | null
): FinancialChange[] => {
  if (!previous || !current) return []

  const fields: Array<{ key: keyof FinancialPeriod; label: string }> = [
    { key: 'revenue', label: '売上高' },
    { key: 'operating_income', label: '営業利益' },
    { key: 'net_income', label: '純利益' },
    { key: 'total_assets', label: '総資産' },
    { key: 'equity_ratio', label: '自己資本比率' },
    { key: 'roe', label: 'ROE' },
  ]

  return fields.flatMap(({ key, label }) => {
    const prev = previous[key] as number | null
    const curr = current[key] as number | null

    if (prev === null || curr === null || prev === 0) return []

    const changePercent = ((curr - prev) / Math.abs(prev)) * 100

    return [
      {
        field: key,
        label,
        previousValue: prev,
        currentValue: curr,
        changePercent: Math.round(changePercent * 10) / 10,
        isSignificant: Math.abs(changePercent) >= 5,
        direction:
          curr > prev ? 'up' : curr < prev ? 'down' : 'unchanged',
      } satisfies FinancialChange,
    ]
  })
}

/**
 * Detect board member changes between two governance snapshots.
 */
export const detectGovernanceChanges = (
  previous: GovernanceData | null,
  current: GovernanceData | null
): GovernanceChange[] => {
  if (!previous || !current) return []

  const changes: GovernanceChange[] = []

  const prevMembers = new Map(previous.board_members.map((m) => [m.name, m]))
  const currMembers = new Map(current.board_members.map((m) => [m.name, m]))

  // 退任メンバー
  prevMembers.forEach((member, name) => {
    if (!currMembers.has(name)) {
      changes.push({ type: 'left', member })
    }
  })

  // 就任・役職変更メンバー
  currMembers.forEach((member, name) => {
    const prev = prevMembers.get(name)
    if (!prev) {
      changes.push({ type: 'joined', member })
    } else if (prev.role !== member.role) {
      changes.push({ type: 'role_changed', member, previousRole: prev.role })
    }
  })

  return changes
}

/**
 * Check if an article is recent (within 24 hours).
 */
export const isRecentArticle = (publishedAt: Date | string): boolean => {
  const publishedDate =
    publishedAt instanceof Date ? publishedAt : new Date(publishedAt)
  const now = new Date()
  const diffHours =
    (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60)
  return diffHours <= 24
}
