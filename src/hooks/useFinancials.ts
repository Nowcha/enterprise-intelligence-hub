import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore'
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

    const colRef = collection(db, 'companies', ticker, 'financials')

    const q = options.periodType
      ? query(
          colRef,
          where('period_type', '==', options.periodType),
          orderBy('period', 'desc')
        )
      : query(colRef, orderBy('period', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const financials = snapshot.docs.map((doc) => doc.data() as FinancialPeriod)
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
