import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AnalysisSummary } from '@/types'

interface AnalysisData {
  summary: AnalysisSummary | null
  financial_insight: Record<string, unknown> | null
  governance_assessment: Record<string, unknown> | null
  competitor_insight: Record<string, unknown> | null
}

interface UseAnalysisResult {
  data: AnalysisData
  loading: boolean
  error: Error | null
}

const INITIAL_DATA: AnalysisData = {
  summary: null,
  financial_insight: null,
  governance_assessment: null,
  competitor_insight: null,
}

export const useAnalysis = (ticker: string | null): UseAnalysisResult => {
  const [data, setData] = useState<AnalysisData>(INITIAL_DATA)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!ticker) {
      setData(INITIAL_DATA)
      return
    }

    setLoading(true)
    setError(null)

    const colRef = collection(db, 'companies', ticker, 'analysis')

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const newData: AnalysisData = { ...INITIAL_DATA }

        snapshot.docs.forEach((doc) => {
          const docId = doc.id
          const docData = doc.data()

          if (docId === 'summary') {
            newData.summary = docData as AnalysisSummary
          } else if (docId === 'financial_insight') {
            newData.financial_insight = docData as Record<string, unknown>
          } else if (docId === 'governance_assessment') {
            newData.governance_assessment = docData as Record<string, unknown>
          } else if (docId === 'competitor_insight') {
            newData.competitor_insight = docData as Record<string, unknown>
          }
        })

        setData(newData)
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
