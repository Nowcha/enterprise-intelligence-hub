import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { CompanyMeta } from '@/types'

interface UseCompanyResult {
  data: CompanyMeta | null
  loading: boolean
  error: Error | null
}

export const useCompany = (ticker: string | null): UseCompanyResult => {
  const [data, setData] = useState<CompanyMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!ticker) {
      setData(null)
      return
    }

    setLoading(true)
    setError(null)

    const docRef = doc(db, 'companies', ticker)
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData(snapshot.data() as CompanyMeta)
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
