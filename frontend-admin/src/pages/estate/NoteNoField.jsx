import { useEffect, useState } from 'react'

// The note number is typed into a draft and saved with the Save button (or Enter). The screen says when it is
// saved, and if saving fails the typed number stays on screen so it can be saved again. It used to be sent to the
// server on every key with no Save button and no message, and a failed save silently reloaded the old number.
export default function NoteNoField({ value, onSave, disabled = false, inputStyle = {}, compact = false }) {
  const saved = value || ''
  const [draft, setDraft] = useState(saved)
  const [state, setState] = useState('idle') // idle | saving | saved | error

  // follow the saved value (a reload, a renumbering), but never throw away a draft whose save failed
  useEffect(() => {
    if (state !== 'error') setDraft(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const dirty = draft !== saved
  const save = async () => {
    if (!dirty || disabled || state === 'saving') return
    setState('saving')
    const ok = await onSave(draft.trim())
    setState(ok ? 'saved' : 'error')
  }

  const statusText = { saving: 'Saving...', saved: '✓ Saved', error: 'Could not save. Please try again.' }[state]
  const statusColor = state === 'error' ? '#b91c1c' : state === 'saved' ? '#15803d' : 'var(--text-3)'

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          disabled={disabled}
          value={draft}
          placeholder="e.g. IWD/26-27/230"
          onChange={(e) => { setDraft(e.target.value); setState('idle') }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
          style={{ flex: 1, minWidth: 0, ...inputStyle }}
        />
        {!disabled && (
          <button
            type="button"
            onClick={save}
            disabled={!dirty || state === 'saving'}
            style={{
              padding: compact ? '4px 10px' : '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: dirty ? 'var(--green-800, #1f4d3f)' : '#cbd5e1',
              color: '#fff',
              fontSize: compact ? 12 : 13,
              fontWeight: 700,
              cursor: dirty ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
            }}
          >
            Save
          </button>
        )}
      </div>
      {!disabled && (statusText || dirty) && (
        <div style={{ fontSize: 11, marginTop: 3, color: statusColor, fontWeight: 600 }}>
          {statusText || 'Not saved yet. Press Save.'}
        </div>
      )}
    </div>
  )
}
