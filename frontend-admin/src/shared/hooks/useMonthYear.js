import { useState } from 'react'

export function useMonthYear() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  return { month, year, setMonth, setYear }
}
