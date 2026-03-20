import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FinancialPeriod } from '@/types'

interface UseFinancialsOptions {
  periodType?: 'annual' | 'quarterly'
}

interface UseFinancialsResult {
  data: FinancialPeriod[]
  loading: boolean
  error: Error | null
}

export const useFinancials = (
  ticker: string | null,
  options: UseFinancialsOptions = {}
): UseFinancialsResult => {
  const [data, setData] = useState<FinancialPeriod[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!ticker) {
      setData([])
      return
    }

    setLoading(true)
    setError(null)

    // Use a simple single-field orderBy (auto-indexed by Firestore).
    // Composite indexes (where + orderBy) require manual deployment and build time.
    // Client-side filtering by periodType avoids that dependency entirely.
    const colRef = collection(db, 'companies', ticker, 'financials')
    const q = query(colRef, orderBy('period', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let financials = snapshot.docs.map((doc) => doc.data() as FinancialPeriod)
        if (options.periodType) {
          financials = financials.filter((f) => f.period_type === options.periodType)
        }
        setData(financials)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [ticker, options.periodType])

  return { data, loading, error }
}
