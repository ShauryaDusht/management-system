import { useMemo } from 'react'

import { Field, SelectField } from '../../components/ui'

const MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
]

const START_YEAR = 2023

export default function MonthYearPicker({ month, year, onMonthChange, onYearChange }) {
  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const list = []
    for (let y = currentYear; y >= START_YEAR; y -= 1) {
      list.push(y)
    }
    return list
  }, [currentYear])

  return (
    <>
      <Field label="Month">
        <SelectField
          value={month}
          onChange={(e) => onMonthChange?.(Number(e.target.value))}
          style={{ width: 160 }}
        >
          {MONTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </SelectField>
      </Field>
      <Field label="Year">
        <SelectField
          value={year}
          onChange={(e) => onYearChange?.(Number(e.target.value))}
          style={{ width: 120 }}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </SelectField>
      </Field>
    </>
  )
}
