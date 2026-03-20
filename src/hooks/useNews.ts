import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { NewsArticle } from '@/types'

interface UseNewsOptions {
  limitCount?: number
}

interface UseNewsResult {
  data: NewsArticle[]
  loading: boolean
  error: Error | null
}

export const useNews = (
  ticker: string | null,
  options: UseNewsOptions = {}
): UseNewsResult => {
  const [data, setData] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!ticker) {
      setData([])
      return
    }

    setLoading(true)
    setError(null)

    const colRef = collection(db, 'companies', ticker, 'news')
    const q = query(
      colRef,
      orderBy('published_at', 'desc'),
      limit(options.limitCount ?? 50)
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const articles = snapshot.docs.map((d) => d.data() as NewsArticle)
        setData(articles)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [ticker, options.limitCount])

  return { data, loading, error }
}
