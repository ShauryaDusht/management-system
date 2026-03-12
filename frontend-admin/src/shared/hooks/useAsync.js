import { useCallback, useEffect, useState } from 'react'

import { getErrorMessage } from '../utils'

export function useAsyncLoad(asyncFn, deps = [], fallback) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const run = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await asyncFn()
      setData(result)
    } catch (e) {
      setError(getErrorMessage(e, fallback))
    } finally {
      setLoading(false)
    }
  }, [...deps, fallback])

  useEffect(() => {
    run()
  }, [run])

  return { data, loading, error, reload: run }
}

export function useAsyncAction() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(async (asyncFn, fallback) => {
    setSaving(true)
    setError('')
    try {
      return await asyncFn()
    } catch (e) {
      setError(getErrorMessage(e, fallback))
      return null
    } finally {
      setSaving(false)
    }
  }, [])

  const clearError = useCallback(() => setError(''), [])

  return { run, saving, error, clearError }
}
