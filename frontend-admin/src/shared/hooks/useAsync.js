import { useCallback, useEffect, useState } from 'react'

export function useAsync(asyncFn, deps = []) {
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
      setError(e?.response?.data?.detail || e?.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { run() }, [run])

  return { loading, error, data, reload: run }
}