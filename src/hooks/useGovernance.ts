import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { GovernanceData } from '@/types'

interface UseGovernanceResult {
  data: GovernanceData | null
  loading: boolean
  error: Error | null
}

export const useGovernance = (ticker: string | null): UseGovernanceResult => {
  const [data, setData] = useState<GovernanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!ticker) {
      setData(null)
      return
    }

    setLoading(true)
    setError(null)

    const docRef = doc(db, 'companies', ticker, 'governance', 'latest')
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData(snapshot.data() as GovernanceData)
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
