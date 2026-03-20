import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { CompetitorData } from '@/types'

interface UseCompetitorsResult {
  data: CompetitorData | null
  loading: boolean
  error: Error | null
}

export const useCompetitors = (ticker: string | null): UseCompetitorsResult => {
  const [data, setData] = useState<CompetitorData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!ticker) {
      setData(null)
      return
    }

    setLoading(true)
    setError(null)

    const docRef = doc(db, 'companies', ticker, 'competitors', 'latest')
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData(snapshot.data() as CompetitorData)
        } else {
          setData(null)
        }
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
