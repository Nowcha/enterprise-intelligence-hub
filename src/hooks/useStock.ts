import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { StockData } from '@/types'

interface UseStockResult {
  data: StockData | null
  loading: boolean
  error: Error | null
}

export const useStock = (ticker: string | null): UseStockResult => {
  const [data, setData] = useState<StockData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!ticker) {
      setData(null)
      return
    }

    setLoading(true)
    setError(null)

    const docRef = doc(db, 'companies', ticker, 'stock', 'latest')
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        setData(snapshot.exists() ? (snapshot.data() as StockData) : null)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [ticker])

  return { data, loading, error }
}
