import { useCallback, useEffect, useMemo, useState } from 'react'

import { horticultureAPI } from '../../api/horticulture'
import { Alert, Btn, Card, DataTable, ExportDropdown, Input, Modal, SelectField, Spinner, StatCard } from '../../components/ui'
import { exportReport } from '../../shared/exportHelper'
import { generateImageUrl, handleImageError, imageDebugEnabled, imageDebugLog } from '../../shared/imageUrls'
import { asList, getErrorMessage, todayISO, triggerDownload } from '../../shared/utils'

const PHOTO_PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='220'%3E%3Crect width='100%25' height='100%25' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='sans-serif' font-size='14'%3EPhoto unavailable%3C/text%3E%3C/svg%3E"

const normalizeMediaUrl = generateImageUrl

function handlePhotoError(event) {
  handleImageError(event, PHOTO_PLACEHOLDER, { gallery: 'horticulture' })
}

function safeName(value, fallback = 'photo') {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return text || fallback
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-IN')
}

/* Single tile for flat grid / thumbnail views */
function PhotoTile({ row, height = 150, onClick }) {
  const typeLabel = row.photo_type === 'before' ? 'Before' : 'After'
  const sessionLabel = row.session ? ` | ${row.session}` : ''
  const isBefore = row.photo_type === 'before'
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <img
        src={row.photo_url}
        alt={`${row.task_type_name || 'Task'} - ${row.area_name || 'Area'}`}
        loading="lazy"
        onClick={onClick}
        onError={handlePhotoError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 8,
          border: '1px solid var(--border)',
          cursor: onClick ? 'pointer' : 'default',
          background: '#f3f4f6',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 7,
          top: 7,
          background: isBefore ? 'rgba(217, 119, 6, 0.90)' : 'rgba(22, 163, 74, 0.90)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          borderRadius: 6,
          padding: '2px 7px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
        }}
      >
        {typeLabel}{sessionLabel}
      </span>
    </div>
  )
}

/* Side-by-side Before & After Card for tasks in Area View and Compare View */
function BeforeAfterCompareCard({ assignment, onCompareClick, onDownloadPhoto }) {
  const beforeUrl = normalizeMediaUrl(assignment.photo_before_url)
  const afterUrl = normalizeMediaUrl(assignment.photo_after_url || assignment.photo_url)
  const hasBoth = Boolean(beforeUrl && afterUrl)

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 12,
      }}
    >
      {/* Card Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--surface-2, #f8fafc)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
            🌿 {assignment.task_type_name || 'Horticulture Task'}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--green-800)',
              background: 'var(--green-100, #dcfce7)',
              padding: '2px 8px',
              borderRadius: 12,
            }}
          >
            {assignment.area_name || 'Area'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            📅 {formatDate(assignment.date)} {assignment.session ? `· ${assignment.session}` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(assignment.completed_by_name || assignment.assigned_by_name) && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-700, #15803d)', background: 'var(--green-50, #f0fdf4)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--green-200, #bbf7d0)' }}>
              📸 Supervisor: {assignment.completed_by_name || assignment.assigned_by_name}
            </span>
          )}
          {assignment.worker_name && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>
              🛠️ Worker: {assignment.worker_name}
            </span>
          )}
          <Btn size="sm" variant="primary" onClick={() => onCompareClick(assignment)}>
            🔍 Compare Side-by-Side
          </Btn>
        </div>
      </div>

      {/* Side-by-side Images Container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: hasBoth ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
          gap: 6,
          background: '#090d16',
          padding: 6,
        }}
      >
        {beforeUrl && (
          <div
            onClick={() => onCompareClick(assignment)}
            style={{
              position: 'relative',
              cursor: 'pointer',
              overflow: 'hidden',
              borderRadius: 8,
              height: 280,
              background: '#0f172a',
            }}
            title="Click to view full comparison"
          >
            <img
              src={beforeUrl}
              alt="Before task execution"
              onError={handlePhotoError}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.25s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.025)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            />
            <span
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(217, 119, 6, 0.95)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: 6,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
              }}
            >
              ◀ BEFORE {assignment.session ? `| ${assignment.session}` : ''}
            </span>
          </div>
        )}

        {afterUrl && (
          <div
            onClick={() => onCompareClick(assignment)}
            style={{
              position: 'relative',
              cursor: 'pointer',
              overflow: 'hidden',
              borderRadius: 8,
              height: 280,
              background: '#0f172a',
            }}
            title="Click to view full comparison"
          >
            <img
              src={afterUrl}
              alt="After task execution"
              onError={handlePhotoError}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.25s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.025)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            />
            <span
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'rgba(22, 163, 74, 0.95)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: 6,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
              }}
            >
              AFTER {assignment.session ? `| ${assignment.session}` : ''} ▶
            </span>
          </div>
        )}
      </div>

      {/* Note / Footer */}
      {assignment.note && (
        <div
          style={{
            padding: '8px 14px',
            fontSize: 12,
            color: 'var(--text-2)',
            background: 'var(--surface-2)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <strong>Supervisor Note:</strong> {assignment.note}
        </div>
      )}
    </div>
  )
}

/* Dedicated Inline Side-by-Side Comparison Viewer (Directly matches User Reference Image 2!) */
function SideBySideCompareViewer({
  assignment,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  onOpenModal,
  onDownloadPhoto,
  assignments,
  onSelectIndex,
}) {
  if (!assignment) {
    return (
      <Card>
        <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 36 }}>
          No task photos available for comparison.
        </div>
      </Card>
    )
  }

  const beforeUrl = normalizeMediaUrl(assignment.photo_before_url)
  const afterUrl = normalizeMediaUrl(assignment.photo_after_url || assignment.photo_url)
  const hasBoth = Boolean(beforeUrl && afterUrl)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
      {/* Main Container matching Screenshot 2 */}
      <div
        style={{
          position: 'relative',
          background: '#080c14',
          borderRadius: 16,
          border: '1.5px solid rgba(255,255,255,0.12)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            padding: '12px 20px',
            background: 'rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
              🌿 {assignment.task_type_name || 'Horticulture Task'}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#86efac',
                background: 'rgba(34, 197, 94, 0.16)',
                padding: '3px 10px',
                borderRadius: 14,
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              📍 {assignment.area_name || 'Area'}
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              📅 {formatDate(assignment.date)} {assignment.session ? `· ${assignment.session}` : ''}
            </span>
            {(assignment.completed_by_name || assignment.assigned_by_name) && (
              <span
                style={{
                  fontSize: 12,
                  color: '#86efac',
                  background: 'rgba(34, 197, 94, 0.15)',
                  padding: '3px 9px',
                  borderRadius: 6,
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  fontWeight: 600,
                }}
              >
                📸 Supervisor: <strong>{assignment.completed_by_name || assignment.assigned_by_name}</strong>
              </span>
            )}
            {assignment.worker_name && (
              <span style={{ fontSize: 12, color: '#e2e8f0' }}>
                🛠️ Assigned Worker: <strong>{assignment.worker_name}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 4 }}>
              Task {currentIndex + 1} of {totalCount}
            </span>
            <button
              onClick={() => onOpenModal(assignment)}
              style={{
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '5px 12px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⛶ Fullscreen
            </button>
            {beforeUrl && (
              <button
                onClick={() => onDownloadPhoto(beforeUrl, `before_${safeName(assignment.task_type_name)}_${assignment.date}.jpg`)}
                style={{
                  background: 'rgba(217, 119, 6, 0.25)',
                  color: '#fde68a',
                  border: '1px solid #d97706',
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⬇ Before
              </button>
            )}
            {afterUrl && (
              <button
                onClick={() => onDownloadPhoto(afterUrl, `after_${safeName(assignment.task_type_name)}_${assignment.date}.jpg`)}
                style={{
                  background: 'rgba(22, 163, 74, 0.25)',
                  color: '#bbf7d0',
                  border: '1px solid #16a34a',
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⬇ After
              </button>
            )}
          </div>
        </div>

        {/* Center Display with Side-by-Side Photos and Circular < & > Navigation Buttons */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 520,
            background: '#05070d',
            padding: '16px 64px',
          }}
        >
          {/* Circular Left Arrow Button (‹) */}
          <button
            onClick={onPrev}
            disabled={totalCount <= 1}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'rgba(15, 23, 42, 0.82)',
              border: '2px solid rgba(255,255,255,0.3)',
              color: '#fff',
              fontSize: 26,
              fontWeight: 800,
              cursor: totalCount <= 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
              transition: 'all 0.2s ease',
              opacity: totalCount <= 1 ? 0.35 : 1,
            }}
            onMouseEnter={(e) => {
              if (totalCount > 1) {
                e.currentTarget.style.background = 'rgba(0,0,0,0.95)'
                e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.82)'
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
            }}
            title="Previous Task (Left Arrow ◄)"
            aria-label="Previous Task"
          >
            ‹
          </button>

          {/* Two Images Side-by-Side (Matching user's Screenshot 2) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: hasBoth ? '1fr 1fr' : '1fr',
              gap: 14,
              width: '100%',
              maxWidth: 1350,
              height: 520,
            }}
          >
            {/* Before Photo */}
            <div
              onClick={() => onOpenModal(assignment)}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#080d16',
                border: '1.5px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
              }}
              title="Click to expand"
            >
              {beforeUrl ? (
                <img
                  src={beforeUrl}
                  alt="Before Task"
                  onError={handlePhotoError}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    transition: 'transform 0.25s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                />
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  📷 Before photo not uploaded for this task
                </div>
              )}
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  background: 'rgba(217, 119, 6, 0.95)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '5px 14px',
                  borderRadius: 18,
                  letterSpacing: '0.04em',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
                }}
              >
                ◀ BEFORE {assignment.session ? `| ${assignment.session}` : ''}
              </div>
            </div>

            {/* After Photo */}
            <div
              onClick={() => onOpenModal(assignment)}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#080d16',
                border: '1.5px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
              }}
              title="Click to expand"
            >
              {afterUrl ? (
                <img
                  src={afterUrl}
                  alt="After Task"
                  onError={handlePhotoError}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    transition: 'transform 0.25s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                />
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  📷 After photo not uploaded yet
                </div>
              )}
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: 'rgba(22, 163, 74, 0.95)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '5px 14px',
                  borderRadius: 18,
                  letterSpacing: '0.04em',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
                }}
              >
                AFTER {assignment.session ? `| ${assignment.session}` : ''} ▶
              </div>
            </div>
          </div>

          {/* Circular Right Arrow Button (›) */}
          <button
            onClick={onNext}
            disabled={totalCount <= 1}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'rgba(15, 23, 42, 0.82)',
              border: '2px solid rgba(255,255,255,0.3)',
              color: '#fff',
              fontSize: 26,
              fontWeight: 800,
              cursor: totalCount <= 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
              transition: 'all 0.2s ease',
              opacity: totalCount <= 1 ? 0.35 : 1,
            }}
            onMouseEnter={(e) => {
              if (totalCount > 1) {
                e.currentTarget.style.background = 'rgba(0,0,0,0.95)'
                e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.82)'
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
            }}
            title="Next Task (Right Arrow ►)"
            aria-label="Next Task"
          >
            ›
          </button>
        </div>

        {/* Footer Note */}
        {assignment.note && (
          <div
            style={{
              padding: '10px 20px',
              fontSize: 12,
              color: '#e2e8f0',
              background: 'rgba(255,255,255,0.03)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <strong>Supervisor Note:</strong> {assignment.note}
          </div>
        )}
      </div>

      {/* Task Thumbnails Carousel / Selector */}
      {totalCount > 1 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>
            Select Task to Compare ({totalCount} tasks):
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              padding: '4px 2px 10px 2px',
              scrollbarWidth: 'thin',
            }}
          >
            {assignments.map((item, idx) => {
              const isSelected = idx === currentIndex
              const bUrl = normalizeMediaUrl(item.photo_before_url)
              const aUrl = normalizeMediaUrl(item.photo_after_url || item.photo_url)
              return (
                <button
                  key={`thumb-task-${item.id}`}
                  onClick={() => onSelectIndex(idx)}
                  style={{
                    flex: '0 0 auto',
                    width: 150,
                    padding: 8,
                    borderRadius: 10,
                    border: isSelected ? '2.5px solid #16a34a' : '1px solid var(--border)',
                    background: isSelected ? 'var(--surface-2, #f0fdf4)' : 'var(--surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: isSelected ? '0 4px 12px rgba(22,163,74,0.3)' : '0 2px 6px rgba(0,0,0,0.04)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, height: 48, marginBottom: 6 }}>
                    <img
                      src={bUrl || PHOTO_PLACEHOLDER}
                      alt="thumb before"
                      onError={handlePhotoError}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, background: '#e2e8f0' }}
                    />
                    <img
                      src={aUrl || PHOTO_PLACEHOLDER}
                      alt="thumb after"
                      onError={handlePhotoError}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, background: '#e2e8f0' }}
                    />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.task_type_name || 'Task'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.area_name || 'Area'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* Fullscreen Side-by-Side Comparison Modal with < and > circular buttons (Exact match to Image 2!) */
function CompareModal({ assignment, onPrev, onNext, onClose, onDownloadPhoto, currentIndex, totalCount }) {
  if (!assignment) return null

  const beforeUrl = normalizeMediaUrl(assignment.photo_before_url)
  const afterUrl = normalizeMediaUrl(assignment.photo_after_url || assignment.photo_url)
  const hasBoth = Boolean(beforeUrl && afterUrl)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 15, 0.94)',
        backdropFilter: 'blur(8px)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '14px 20px',
        userSelect: 'none',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#fff',
          zIndex: 10,
          flexWrap: 'wrap',
          gap: 12,
          paddingBottom: 10,
          borderBottom: '1px solid rgba(255,255,255,0.14)',
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🌿 {assignment.task_type_name || 'Task Comparison'}</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                background: 'rgba(255,255,255,0.18)',
                padding: '3px 10px',
                borderRadius: 14,
                color: '#e2e8f0',
              }}
            >
              {assignment.area_name || 'Area'}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              ({currentIndex + 1} of {totalCount})
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
            📸 Supervisor (Photo Captured By): <strong style={{ color: '#86efac' }}>{assignment.completed_by_name || assignment.assigned_by_name || 'Supervisor'}</strong> · 
            🛠️ Assigned Worker: <strong style={{ color: '#fff' }}>{assignment.worker_name || '-'}</strong> · 
            Date: <strong style={{ color: '#fff' }}>{formatDate(assignment.date)}</strong>
            {assignment.session ? ` (${assignment.session})` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {beforeUrl && (
            <button
              onClick={() => onDownloadPhoto(beforeUrl, `before_${safeName(assignment.task_type_name)}_${assignment.date}.jpg`)}
              style={{
                background: 'rgba(217, 119, 6, 0.25)',
                color: '#fde68a',
                border: '1.5px solid #d97706',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⬇ Download Before
            </button>
          )}
          {afterUrl && (
            <button
              onClick={() => onDownloadPhoto(afterUrl, `after_${safeName(assignment.task_type_name)}_${assignment.date}.jpg`)}
              style={{
                background: 'rgba(22, 163, 74, 0.25)',
                color: '#bbf7d0',
                border: '1.5px solid #16a34a',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⬇ Download After
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: 'none',
              color: '#fff',
              fontSize: 20,
              width: 38,
              height: 38,
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.7)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Center Area with Circular Arrow Buttons on Left and Right (Exact match to Image 2!) */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 64px',
          overflow: 'hidden',
        }}
      >
        {/* Left Arrow Button */}
        <button
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(15, 23, 42, 0.75)',
            border: '2px solid rgba(255,255,255,0.3)',
            color: '#fff',
            fontSize: 26,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'background 0.2s, transform 0.2s',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.95)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
          }}
          title="Previous (Left Arrow)"
          aria-label="Previous task photo"
        >
          ‹
        </button>

        {/* Side-by-side Images Container */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hasBoth ? '1fr 1fr' : '1fr',
            gap: 18,
            width: '100%',
            maxWidth: 1350,
            maxHeight: '74vh',
            height: '100%',
            alignItems: 'center',
          }}
        >
          {beforeUrl && (
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                overflow: 'hidden',
                background: '#0a0e17',
                border: '1.5px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              }}
            >
              <img
                src={beforeUrl}
                alt="Before Task"
                onError={handlePhotoError}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  background: 'rgba(217, 119, 6, 0.95)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '5px 14px',
                  borderRadius: 20,
                  letterSpacing: '0.06em',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                }}
              >
                ◀ BEFORE
              </div>
            </div>
          )}

          {afterUrl && (
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                overflow: 'hidden',
                background: '#0a0e17',
                border: '1.5px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              }}
            >
              <img
                src={afterUrl}
                alt="After Task"
                onError={handlePhotoError}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: 'rgba(22, 163, 74, 0.95)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '5px 14px',
                  borderRadius: 20,
                  letterSpacing: '0.06em',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                }}
              >
                AFTER ▶
              </div>
            </div>
          )}
        </div>

        {/* Right Arrow Button */}
        <button
          onClick={(e) => { e.stopPropagation(); onNext() }}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(15, 23, 42, 0.75)',
            border: '2px solid rgba(255,255,255,0.3)',
            color: '#fff',
            fontSize: 26,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'background 0.2s, transform 0.2s',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.95)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
          }}
          title="Next (Right Arrow)"
          aria-label="Next task photo"
        >
          ›
        </button>
      </div>

      {/* Bottom Footer Note & Keyboard Hint */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'rgba(255,255,255,0.75)',
          fontSize: 12,
          padding: '6px 14px',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 8,
          maxWidth: 1000,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <span>
          {assignment.note ? `📝 Note: ${assignment.note}` : 'Side-by-side Before and After task verification'}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          Tip: Use ◄ and ► arrow keys to browse tasks
        </span>
      </div>
    </div>
  )
}

export default function GalleryTab() {
  const [view, setView] = useState('compare')
  const [sort, setSort] = useState('newest')
  const [filters, setFilters] = useState({
    area: '',
    worker: '',
    task: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [rows, setRows] = useState([])
  const [assignments, setAssignments] = useState([])
  const [areas, setAreas] = useState([])
  const [compareIndex, setCompareIndex] = useState(0)
  const [compareModal, setCompareModal] = useState({ open: false, index: 0 })
  const [dateExportModal, setDateExportModal] = useState({
    open: false,
    dateFrom: '',
    dateTo: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [assignmentRes, areaRes] = await Promise.all([
        horticultureAPI.listDailyAssignments(imageDebugEnabled() ? { debugImages: '1' } : {}),
        horticultureAPI.getAreas(),
      ])
      imageDebugLog('horticulture.gallery.response', { assignments: assignmentRes.data?.slice?.(0, 3), areas: areaRes.data?.slice?.(0, 3) })
      
      const rawAssignments = asList(assignmentRes.data)
      setAssignments(
        rawAssignments.filter((row) => Boolean(normalizeMediaUrl(row.photo_before_url)) || Boolean(normalizeMediaUrl(row.photo_after_url || row.photo_url)))
      )

      setRows(
        rawAssignments.flatMap((row) => {
          const beforeUrl = normalizeMediaUrl(row.photo_before_url)
          const afterUrl = normalizeMediaUrl(row.photo_after_url || row.photo_url)
          const supervisor = row.completed_by_name || row.assigned_by_name || 'Supervisor'
          return [
            beforeUrl ? { ...row, photo_url: beforeUrl, photo_type: 'before', photo_key: `${row.id}-before`, photo_uploaded_at: row.photo_before_uploaded_at || row.started_at, supervisor_name: supervisor } : null,
            afterUrl ? { ...row, photo_url: afterUrl, photo_type: 'after', photo_key: `${row.id}-after`, photo_uploaded_at: row.photo_after_uploaded_at || row.photo_uploaded_at || row.completed_at, supervisor_name: supervisor } : null,
          ].filter(Boolean)
        })
      )
      setAreas(asList(areaRes.data))
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load horticulture gallery.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const photoRows = useMemo(() => rows.filter((row) => row.photo_url), [rows])

  const workerOptions = useMemo(() => {
    const map = new Map()
    rows.forEach((row) => {
      if (row.worker) map.set(String(row.worker), row.worker_name || `Worker #${row.worker}`)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const taskOptions = useMemo(() => {
    const map = new Map()
    rows.forEach((row) => {
      if (row.task_type) map.set(String(row.task_type), row.task_type_name || `Task #${row.task_type}`)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  /* Filtered raw assignments (used for Compare View and Area View) */
  const filteredAssignments = useMemo(() => {
    const query = filters.search.trim().toLowerCase()
    const list = assignments.filter((row) => {
      if (filters.area && String(row.area) !== String(filters.area)) return false
      if (filters.worker && String(row.worker) !== String(filters.worker)) return false
      if (filters.task && String(row.task_type) !== String(filters.task)) return false
      if (filters.dateFrom && row.date < filters.dateFrom) return false
      if (filters.dateTo && row.date > filters.dateTo) return false
      if (!query) return true
      return [
        row.area_name,
        row.worker_name,
        row.task_type_name,
        row.session,
        row.note,
        row.assigned_by_name,
        row.completed_by_name,
        row.supervisor_name,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })

    return [...list].sort((a, b) => {
      if (sort === 'oldest') return String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id)
      if (sort === 'area_az') return String(a.area_name || '').localeCompare(String(b.area_name || ''))
      if (sort === 'worker_az') return String(a.worker_name || '').localeCompare(String(b.worker_name || ''))
      return String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id)
    })
  }, [assignments, filters, sort])

  /* Reset compare index if list size changes */
  useEffect(() => {
    if (compareIndex >= filteredAssignments.length) {
      setCompareIndex(0)
    }
  }, [filteredAssignments.length, compareIndex])

  /* Filtered photos (used for single photo grid and export) */
  const filteredPhotos = useMemo(() => {
    const query = filters.search.trim().toLowerCase()
    const list = photoRows.filter((row) => {
      if (filters.area && String(row.area) !== String(filters.area)) return false
      if (filters.worker && String(row.worker) !== String(filters.worker)) return false
      if (filters.task && String(row.task_type) !== String(filters.task)) return false
      if (filters.dateFrom && row.date < filters.dateFrom) return false
      if (filters.dateTo && row.date > filters.dateTo) return false
      if (!query) return true
      return [
        row.area_name,
        row.worker_name,
        row.task_type_name,
        row.session,
        row.note,
        row.assigned_by_name,
        row.completed_by_name,
        row.supervisor_name,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })

    return [...list].sort((a, b) => {
      if (sort === 'oldest') return String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id)
      if (sort === 'area_az') return String(a.area_name || '').localeCompare(String(b.area_name || ''))
      if (sort === 'worker_az') return String(a.worker_name || '').localeCompare(String(b.worker_name || ''))
      return String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id)
    })
  }, [filters, photoRows, sort])

  /* Group assignments by area for Area View */
  const groupedAssignmentsByArea = useMemo(() => {
    const map = new Map()
    filteredAssignments.forEach((assignment) => {
      const areaKey = String(assignment.area || 'unknown')
      if (!map.has(areaKey)) {
        map.set(areaKey, {
          areaId: areaKey,
          areaName: assignment.area_name || 'Unknown Area',
          assignments: [],
        })
      }
      map.get(areaKey).assignments.push(assignment)
    })
    return Array.from(map.values())
  }, [filteredAssignments])

  const stats = useMemo(() => {
    const areasWithPhotos = new Set(photoRows.map((row) => row.area).filter(Boolean)).size
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonth = photoRows.filter((row) => {
      const date = new Date(row.date)
      return !Number.isNaN(date.getTime()) && date >= thisMonthStart
    }).length
    const todayStr = todayISO()
    const todayPhotos = photoRows.filter((row) => row.date === todayStr).length
    return {
      totalPhotos: photoRows.length,
      visiblePhotos: filteredPhotos.length,
      totalAssignments: assignments.length,
      todayPhotos,
      thisMonth,
      areasWithPhotos,
      totalAreas: areas.length,
    }
  }, [areas.length, assignments.length, filteredPhotos.length, photoRows])

  const latestDate = useMemo(() => {
    if (!photoRows.length) return todayISO()
    const sortedDates = [...photoRows].map((r) => r.date).filter(Boolean).sort().reverse()
    return sortedDates[0] || todayISO()
  }, [photoRows])

  const openCompareModal = (assignment) => {
    const index = filteredAssignments.findIndex((a) => a.id === assignment.id)
    const targetIdx = Math.max(0, index)
    setCompareIndex(targetIdx)
    setCompareModal({ open: true, index: targetIdx })
  }

  const moveCompare = useCallback((delta) => {
    setCompareIndex((prev) => {
      if (!filteredAssignments.length) return 0
      return (prev + delta + filteredAssignments.length) % filteredAssignments.length
    })
    setCompareModal((prev) => {
      if (!filteredAssignments.length) return prev
      const index = (prev.index + delta + filteredAssignments.length) % filteredAssignments.length
      return { ...prev, index }
    })
  }, [filteredAssignments.length])

  useEffect(() => {
    const onKey = (event) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (compareModal.open) {
        if (event.key === 'Escape') setCompareModal({ open: false, index: 0 })
        if (event.key === 'ArrowLeft') moveCompare(-1)
        if (event.key === 'ArrowRight') moveCompare(1)
      } else if (view === 'compare') {
        if (event.key === 'ArrowLeft') moveCompare(-1)
        if (event.key === 'ArrowRight') moveCompare(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareModal.open, moveCompare, view])

  const handleExportDailyReport = async (format) => {
    const targetDate = filters.dateFrom || (assignments.some((r) => r.date === todayISO()) ? todayISO() : latestDate)
    const taskList = assignments.filter((row) => {
      if (row.date !== targetDate) return false
      if (filters.area && String(row.area) !== String(filters.area)) return false
      if (filters.worker && String(row.worker) !== String(filters.worker)) return false
      if (filters.task && String(row.task_type) !== String(filters.task)) return false
      return true
    })
    const exportTasks = taskList.length ? taskList : assignments.filter((r) => r.date === targetDate)

    if (!exportTasks.length) {
      setError(`No photo records found for Daily Report on ${formatDate(targetDate)}.`)
      return
    }

    const headers = [
      'Date',
      'Session',
      'Type',
      'Supervisor (Photo Captured By)',
      'Assigned Worker(s)',
      'Area',
      'Task',
      'Uploaded At',
      'Note',
    ]
    const rows = exportTasks.flatMap((a) => {
      const beforeUrl = normalizeMediaUrl(a.photo_before_url)
      const afterUrl = normalizeMediaUrl(a.photo_after_url || a.photo_url)
      const sup = a.completed_by_name || a.assigned_by_name || 'Supervisor'
      const worker = a.worker_name || 'Unassigned'
      const res = []
      if (beforeUrl) {
        res.push([
          a.date || '',
          a.session || '',
          'before',
          sup,
          worker,
          a.area_name || '',
          a.task_type_name || '',
          a.photo_before_uploaded_at ? new Date(a.photo_before_uploaded_at).toLocaleString('en-IN') : '',
          a.note || '',
        ])
      }
      if (afterUrl) {
        res.push([
          a.date || '',
          a.session || '',
          'after',
          sup,
          worker,
          a.area_name || '',
          a.task_type_name || '',
          (a.photo_after_uploaded_at || a.photo_uploaded_at) ? new Date(a.photo_after_uploaded_at || a.photo_uploaded_at).toLocaleString('en-IN') : '',
          a.note || '',
        ])
      }
      if (!beforeUrl && !afterUrl) {
        res.push([
          a.date || '',
          a.session || '',
          'task',
          sup,
          worker,
          a.area_name || '',
          a.task_type_name || '',
          '-',
          a.note || '',
        ])
      }
      return res
    })

    const photoTasks = exportTasks.map((a) => ({
      id: a.id,
      task_name: a.task_type_name || 'Horticulture Task',
      area_name: a.area_name || 'General Campus',
      date: a.date,
      session: a.session,
      supervisor_name: a.completed_by_name || a.assigned_by_name || 'Supervisor',
      worker_name: a.worker_name || 'Unassigned',
      note: a.note || '',
      before_photo_url: normalizeMediaUrl(a.photo_before_url),
      before_uploaded_at: a.photo_before_uploaded_at || a.started_at,
      after_photo_url: normalizeMediaUrl(a.photo_after_url || a.photo_url),
      after_uploaded_at: a.photo_after_uploaded_at || a.photo_uploaded_at || a.completed_at,
    }))

    const areasCount = new Set(exportTasks.map((r) => r.area).filter(Boolean)).size
    const supervisors = Array.from(new Set(exportTasks.map((r) => r.supervisor_name || r.completed_by_name || r.assigned_by_name).filter(Boolean))).join(', ')

    await exportReport(format, {
      title: 'Horticulture Daily Task Photo Report',
      subtitle: `Daily Visual Log for ${formatDate(targetDate)} • (${photoTasks.length} tasks, Before & After photos captured by supervisors)`,
      filename: `horticulture_daily_report_${targetDate}`,
      headers,
      rows,
      photoTasks,
      kpis: [
        { label: 'Date', value: formatDate(targetDate) },
        { label: 'Tasks Logged', value: exportTasks.length },
        { label: 'Areas Covered', value: areasCount },
        { label: 'Supervisors on Duty', value: supervisors || 'Supervisor' },
      ],
      metadata: {
        'Report Type': 'Daily Task Photo Log',
        'Date': formatDate(targetDate),
        'Photo Authority': 'Supervisors only (Workers cannot upload photos)',
        'Area Filter': filters.area ? (areas.find((a) => String(a.id) === String(filters.area))?.name || filters.area) : 'All Areas',
        'Export Date': new Date().toLocaleString(),
      },
    })
    setSuccess(`Horticulture Daily Report for ${formatDate(targetDate)} exported as ${format.toUpperCase()}.`)
  }

  const handleExportMonthlyReport = async (format) => {
    const referenceDateStr = filters.dateTo || (assignments.some((r) => r.date === todayISO()) ? todayISO() : latestDate)
    const refDate = new Date(referenceDateStr)
    const validRef = !Number.isNaN(refDate.getTime()) ? refDate : new Date()

    const year = validRef.getFullYear()
    const month = validRef.getMonth() // 0-indexed
    const lastDay = new Date(year, month + 1, 0)
    const pad = (n) => String(n).padStart(2, '0')

    const startStr = filters.dateFrom || `${year}-${pad(month + 1)}-01`
    const endStr = filters.dateTo || `${year}-${pad(month + 1)}-${pad(lastDay.getDate())}`
    const monthName = validRef.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

    const taskList = assignments.filter((row) => {
      if (!row.date || row.date < startStr || row.date > endStr) return false
      if (filters.area && String(row.area) !== String(filters.area)) return false
      if (filters.worker && String(row.worker) !== String(filters.worker)) return false
      if (filters.task && String(row.task_type) !== String(filters.task)) return false
      return true
    })
    const exportTasks = taskList.length ? taskList : assignments.filter((r) => r.date >= startStr && r.date <= endStr)

    if (!exportTasks.length) {
      setError(`No photo records found for Monthly Report (${monthName}: ${formatDate(startStr)} to ${formatDate(endStr)}).`)
      return
    }

    const headers = [
      'Date',
      'Session',
      'Type',
      'Supervisor (Photo Captured By)',
      'Assigned Worker(s)',
      'Area',
      'Task',
      'Uploaded At',
      'Note',
    ]
    const rows = exportTasks.flatMap((a) => {
      const beforeUrl = normalizeMediaUrl(a.photo_before_url)
      const afterUrl = normalizeMediaUrl(a.photo_after_url || a.photo_url)
      const sup = a.completed_by_name || a.assigned_by_name || 'Supervisor'
      const worker = a.worker_name || 'Unassigned'
      const res = []
      if (beforeUrl) {
        res.push([
          a.date || '',
          a.session || '',
          'before',
          sup,
          worker,
          a.area_name || '',
          a.task_type_name || '',
          a.photo_before_uploaded_at ? new Date(a.photo_before_uploaded_at).toLocaleString('en-IN') : '',
          a.note || '',
        ])
      }
      if (afterUrl) {
        res.push([
          a.date || '',
          a.session || '',
          'after',
          sup,
          worker,
          a.area_name || '',
          a.task_type_name || '',
          (a.photo_after_uploaded_at || a.photo_uploaded_at) ? new Date(a.photo_after_uploaded_at || a.photo_uploaded_at).toLocaleString('en-IN') : '',
          a.note || '',
        ])
      }
      if (!beforeUrl && !afterUrl) {
        res.push([
          a.date || '',
          a.session || '',
          'task',
          sup,
          worker,
          a.area_name || '',
          a.task_type_name || '',
          '-',
          a.note || '',
        ])
      }
      return res
    })

    const photoTasks = exportTasks.map((a) => ({
      id: a.id,
      task_name: a.task_type_name || 'Horticulture Task',
      area_name: a.area_name || 'General Campus',
      date: a.date,
      session: a.session,
      supervisor_name: a.completed_by_name || a.assigned_by_name || 'Supervisor',
      worker_name: a.worker_name || 'Unassigned',
      note: a.note || '',
      before_photo_url: normalizeMediaUrl(a.photo_before_url),
      before_uploaded_at: a.photo_before_uploaded_at || a.started_at,
      after_photo_url: normalizeMediaUrl(a.photo_after_url || a.photo_url),
      after_uploaded_at: a.photo_after_uploaded_at || a.photo_uploaded_at || a.completed_at,
    }))

    const areasCount = new Set(exportTasks.map((r) => r.area).filter(Boolean)).size
    const supervisors = Array.from(new Set(exportTasks.map((r) => r.supervisor_name || r.completed_by_name || r.assigned_by_name).filter(Boolean))).join(', ')

    await exportReport(format, {
      title: 'Horticulture Monthly Task Photo Report',
      subtitle: `Monthly Visual Log (${monthName} • ${formatDate(startStr)} to ${formatDate(endStr)}) • (${photoTasks.length} tasks, Before & After photos captured by supervisors)`,
      filename: `horticulture_monthly_report_${year}_${pad(month + 1)}`,
      headers,
      rows,
      photoTasks,
      kpis: [
        { label: 'Month', value: monthName },
        { label: 'Tasks Logged', value: exportTasks.length },
        { label: 'Areas Covered', value: areasCount },
        { label: 'Supervisors on Duty', value: supervisors || 'Supervisor' },
      ],
      metadata: {
        'Report Type': 'Monthly Task Photo Log',
        'Month': monthName,
        'Period': `${formatDate(startStr)} to ${formatDate(endStr)}`,
        'Photo Authority': 'Supervisors only (Workers cannot upload photos)',
        'Area Filter': filters.area ? (areas.find((a) => String(a.id) === String(filters.area))?.name || filters.area) : 'All Areas',
        'Export Date': new Date().toLocaleString(),
      },
    })
    setSuccess(`Horticulture Monthly Report (${monthName}) exported as ${format.toUpperCase()}.`)
  }

  const handleExportPhotoLog = async (format, customFrom, customTo) => {
    const fromDate = customFrom !== undefined ? customFrom : filters.dateFrom
    const toDate = customTo !== undefined ? customTo : filters.dateTo

    const query = filters.search.trim().toLowerCase()
    const targetPhotos = photoRows.filter((row) => {
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (filters.area && String(row.area) !== String(filters.area)) return false
      if (filters.worker && String(row.worker) !== String(filters.worker)) return false
      if (filters.task && String(row.task_type) !== String(filters.task)) return false
      if (!query) return true
      return [
        row.area_name,
        row.worker_name,
        row.task_type_name,
        row.session,
        row.note,
        row.assigned_by_name,
        row.completed_by_name,
        row.supervisor_name,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })

    if (!targetPhotos.length) {
      setError(`No photo log records found between ${fromDate ? formatDate(fromDate) : 'start'} and ${toDate ? formatDate(toDate) : 'latest'}.`)
      return
    }

    const headers = [
      'Date',
      'Type',
      'Session',
      'Worker',
      'Area',
      'Task',
      'Assigned By',
      'Photo URL',
      'Uploaded At',
      'Note',
    ]
    const rows = targetPhotos.map((row) => [
      row.date || '',
      row.photo_type || 'after',
      row.session || '',
      row.worker_name || 'Unassigned',
      row.area_name || '',
      row.task_type_name || '',
      row.assigned_by_name || row.supervisor_name || row.completed_by_name || 'Supervisor',
      row.photo_url || '',
      row.photo_uploaded_at ? new Date(row.photo_uploaded_at).toLocaleString('en-IN') : '',
      row.note || '',
    ])

    const dateRangeLabel = fromDate && toDate
      ? `${formatDate(fromDate)} to ${formatDate(toDate)}`
      : fromDate
        ? `From ${formatDate(fromDate)}`
        : toDate
          ? `Up to ${formatDate(toDate)}`
          : 'All Dates'

    await exportReport(format, {
      title: 'Horticulture Task Photo Log',
      subtitle: `Photo Log Report (${targetPhotos.length} records • ${dateRangeLabel}) • Tabular report without photo images`,
      filename: `horticulture_photo_log_${fromDate || 'start'}_to_${toDate || todayISO()}`,
      headers,
      rows,
      kpis: [
        { label: 'Date Range', value: dateRangeLabel },
        { label: 'Total Records', value: targetPhotos.length },
        { label: 'This Month', value: stats.thisMonth },
        { label: 'Areas Covered', value: new Set(targetPhotos.map((r) => r.area).filter(Boolean)).size },
      ],
      metadata: {
        'Report Type': 'Task Photo Log (Data Table without photos)',
        'Date Range': dateRangeLabel,
        'Search Filter': filters.search || 'None',
        'Area Filter': filters.area ? (areas.find((a) => String(a.id) === String(filters.area))?.name || filters.area) : 'All Areas',
        'Task Filter': filters.task ? (taskOptions.find((t) => String(t.id) === String(filters.task))?.name || filters.task) : 'All Tasks',
        'Export Date': new Date().toLocaleString(),
      },
    })
    setSuccess(`Horticulture photo log (${targetPhotos.length} records, ${dateRangeLabel}) exported as ${format.toUpperCase()}.`)
    setDateExportModal((prev) => ({ ...prev, open: false }))
  }

  const downloadDirectPhoto = async (photoUrl, filename) => {
    if (!photoUrl) return
    try {
      const response = await fetch(photoUrl)
      const blob = await response.blob()
      triggerDownload(blob, filename || 'horticulture_task_photo.jpg')
    } catch (err) {
      setError(getErrorMessage(err, 'Photo download failed.'))
    }
  }

  const currentCompareAssignment = filteredAssignments[compareModal.index]

  const listRows = filteredPhotos.map((row) => [
    <div key={`thumb-${row.photo_key}`} style={{ width: 86 }}>
      <PhotoTile row={row} height={52} onClick={() => openCompareModal(row)} />
    </div>,
    row.area_name || '-',
    <span key={`type-${row.photo_key}`} style={{ textTransform: 'capitalize', fontWeight: 700, color: row.photo_type === 'before' ? '#d97706' : '#16a34a' }}>
      {row.photo_type || 'after'}
    </span>,
    row.task_type_name || '-',
    <span key={`sup-${row.photo_key}`} style={{ fontWeight: 600, color: '#15803d' }}>
      📸 {row.supervisor_name || row.completed_by_name || row.assigned_by_name || 'Supervisor'}
    </span>,
    row.worker_name || '-',
    formatDateTime(row.photo_uploaded_at || row.assigned_at),
    <div key={`actions-${row.photo_key}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Btn size="sm" variant="ghost" onClick={() => openCompareModal(row)}>Compare</Btn>
      <Btn size="sm" variant="secondary" onClick={() => downloadDirectPhoto(row.photo_url, `${row.photo_type}_${safeName(row.task_type_name)}.jpg`)}>Download</Btn>
    </div>,
  ])

  return (
    <div>
      <Alert message={error} />
      <Alert message={success} type="success" />

      {/* Top Header Card */}
      <Card style={{ marginBottom: 12, overflow: 'visible', position: 'relative', zIndex: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Task Photo Gallery</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Before and after horticulture task photos uploaded by staff
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>
              {stats.visiblePhotos.toLocaleString()} photos ({filteredAssignments.length} task entries)
            </span>
            <Input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search area, task, worker..."
              style={{ width: 220 }}
            />
            <ExportDropdown
              label="📅 Daily Report"
              variant="primary"
              onExport={handleExportDailyReport}
              disabled={!photoRows.length}
            />
            <ExportDropdown
              label="🗓️ Monthly Report"
              variant="secondary"
              onExport={handleExportMonthlyReport}
              disabled={!photoRows.length}
            />
            <Btn
              variant="secondary"
              onClick={() => {
                const earliestDate = photoRows.length ? [...photoRows].map((r) => r.date).filter(Boolean).sort()[0] : todayISO()
                setDateExportModal({
                  open: true,
                  dateFrom: filters.dateFrom || earliestDate,
                  dateTo: filters.dateTo || todayISO(),
                })
              }}
              disabled={!photoRows.length}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                fontSize: 12,
                borderRadius: 9,
                padding: '6px 14px',
              }}
              title="Click to select calendar date range and download report"
            >
              📅 Export Photo Log
            </Btn>
          </div>
        </div>
      </Card>

      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Total Photos" value={loading ? '...' : stats.totalPhotos} icon="PH" color="#1d4ed8" />
        <StatCard label="Daily Report (Today)" value={loading ? '...' : (stats.todayPhotos > 0 ? stats.todayPhotos : photoRows.filter((r) => r.date === latestDate).length)} icon="DY" color="#059669" />
        <StatCard label="Monthly Report (This Month)" value={loading ? '...' : stats.thisMonth} icon="MO" color="#7c3aed" />
        <StatCard label="Visible Photos" value={loading ? '...' : stats.visiblePhotos} icon="VI" color="#166534" />
        <StatCard label="Areas with Photos" value={loading ? '...' : `${stats.areasWithPhotos} / ${stats.totalAreas}`} icon="AR" color="#c2410c" />
      </div>

      {/* Filters Card */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <SelectField value={filters.area} onChange={(event) => setFilters((prev) => ({ ...prev, area: event.target.value }))}>
            <option value="">All Areas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </SelectField>
          <SelectField value={filters.task} onChange={(event) => setFilters((prev) => ({ ...prev, task: event.target.value }))}>
            <option value="">All Tasks</option>
            {taskOptions.map((task) => (
              <option key={task.id} value={task.id}>{task.name}</option>
            ))}
          </SelectField>
          <SelectField value={filters.worker} onChange={(event) => setFilters((prev) => ({ ...prev, worker: event.target.value }))}>
            <option value="">All Workers</option>
            {workerOptions.map((worker) => (
              <option key={worker.id} value={worker.id}>{worker.name}</option>
            ))}
          </SelectField>
          <SelectField value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="area_az">Area A-Z</option>
            <option value="worker_az">Worker A-Z</option>
          </SelectField>
          <Input
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || todayISO()}
            onChange={(event) => {
              const value = event.target.value
              setFilters((prev) => (
                prev.dateTo && value > prev.dateTo
                  ? { ...prev, dateFrom: value, dateTo: value }
                  : { ...prev, dateFrom: value }
              ))
            }}
          />
          <Input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom}
            max={todayISO()}
            onChange={(event) => {
              const value = event.target.value
              setFilters((prev) => (
                prev.dateFrom && value < prev.dateFrom
                  ? { ...prev, dateFrom: value, dateTo: value }
                  : { ...prev, dateTo: value }
              ))
            }}
          />
        </div>

        {/* View Mode Buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Btn size="sm" variant={view === 'compare' ? 'primary' : 'secondary'} onClick={() => setView('compare')}>
            ↔️ Side-by-Side Compare (Before & After)
          </Btn>
          <Btn size="sm" variant={view === 'area' ? 'primary' : 'secondary'} onClick={() => setView('area')}>
            📸 Area Cards View
          </Btn>
          <Btn size="sm" variant={view === 'grid' ? 'primary' : 'secondary'} onClick={() => setView('grid')}>
            ▦ Single Photos Grid
          </Btn>
          <Btn size="sm" variant={view === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')}>
            ☰ Table List
          </Btn>
          <Btn size="sm" variant="ghost" onClick={load} disabled={loading}>
            🔄 Refresh
          </Btn>
        </div>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
      ) : filteredAssignments.length === 0 ? (
        <Card>
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 24 }}>
            No horticulture task photos found for these filters.
          </div>
        </Card>
      ) : view === 'compare' ? (
        /* Dedicated Side-by-Side Comparison Viewer (Exact Match to User Reference Image 2!) */
        <SideBySideCompareViewer
          assignment={filteredAssignments[compareIndex] || filteredAssignments[0]}
          currentIndex={compareIndex}
          totalCount={filteredAssignments.length}
          assignments={filteredAssignments}
          onPrev={() => moveCompare(-1)}
          onNext={() => moveCompare(1)}
          onSelectIndex={(idx) => {
            setCompareIndex(idx)
            setCompareModal((prev) => ({ ...prev, index: idx }))
          }}
          onOpenModal={(assignment) => openCompareModal(assignment)}
          onDownloadPhoto={downloadDirectPhoto}
        />
      ) : view === 'area' ? (
        /* Area View: Grouped by Area with Before & After Task Cards */
        <div style={{ display: 'grid', gap: 14 }}>
          {groupedAssignmentsByArea.map((area) => (
            <Card key={area.areaId} noPad>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1.5px solid var(--border)',
                  fontWeight: 800,
                  fontSize: 15,
                  background: 'var(--surface)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>📍 {area.areaName}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
                  {area.assignments.length} task entries
                </span>
              </div>
              <div style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
                {area.assignments.map((assignment) => (
                  <BeforeAfterCompareCard
                    key={`assignment-${assignment.id}`}
                    assignment={assignment}
                    onCompareClick={openCompareModal}
                    onDownloadPhoto={downloadDirectPhoto}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : view === 'grid' ? (
        /* Flat Grid View: Individual photos */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
          {filteredPhotos.map((row) => (
            <Card key={row.photo_key} noPad>
              <PhotoTile row={row} height={165} onClick={() => openCompareModal(row)} />
              <div style={{ padding: '10px 11px', fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>Task: {row.task_type_name || '-'}</div>
                <div>Area: {row.area_name || '-'}</div>
                <div>Supervisor: <span style={{ fontWeight: 600, color: 'var(--green-700, #15803d)' }}>{row.supervisor_name || row.completed_by_name || row.assigned_by_name || 'Supervisor'}</span></div>
                <div>Assigned Worker: {row.worker_name || '-'}</div>
                <div style={{ color: 'var(--text-3)', marginTop: 3 }}>
                  Uploaded: {formatDateTime(row.photo_uploaded_at || row.assigned_at)}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="primary" onClick={() => openCompareModal(row)}>Compare</Btn>
                  <Btn size="sm" variant="secondary" onClick={() => downloadDirectPhoto(row.photo_url, `${row.photo_type}_${safeName(row.task_type_name)}.jpg`)}>Download</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <Card noPad>
          <DataTable
            headers={['Thumbnail', 'Area', 'Type', 'Task Name', 'Supervisor (Photo Captured By)', 'Assigned Worker', 'Uploaded At', 'Actions']}
            rows={listRows}
            emptyMsg="No horticulture task photos found."
          />
        </Card>
      )}

      {/* Fullscreen Side-by-Side Comparison Modal (Exact Match to User's Image 2!) */}
      {compareModal.open && (
        <CompareModal
          assignment={currentCompareAssignment}
          currentIndex={compareModal.index}
          totalCount={filteredAssignments.length}
          onPrev={() => moveCompare(-1)}
          onNext={() => moveCompare(1)}
          onClose={() => setCompareModal({ open: false, index: 0 })}
          onDownloadPhoto={downloadDirectPhoto}
        />
      )}

      {/* Date-Range Export Modal for Photo Log (Without Photos) */}
      {dateExportModal.open && (
        <Modal
          open={dateExportModal.open}
          onClose={() => setDateExportModal((prev) => ({ ...prev, open: false }))}
          title="🗓️ Export Photo Log (Select Date Range)"
          width={580}
          footer={(
            <Btn variant="ghost" onClick={() => setDateExportModal((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Btn>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              Select the start and end dates to download the tabular photo log report (without photos):
            </div>

            {/* Quick Date Range Preset Buttons */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDateExportModal((prev) => ({ ...prev, dateFrom: todayISO(), dateTo: todayISO() }))}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 600 }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const yest = new Date()
                  yest.setDate(yest.getDate() - 1)
                  const yestStr = yest.toISOString().slice(0, 10)
                  setDateExportModal((prev) => ({ ...prev, dateFrom: yestStr, dateTo: yestStr }))
                }}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 600 }}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => {
                  const w = new Date()
                  w.setDate(w.getDate() - 6)
                  setDateExportModal((prev) => ({ ...prev, dateFrom: w.toISOString().slice(0, 10), dateTo: todayISO() }))
                }}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 600 }}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  const mStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
                  setDateExportModal((prev) => ({ ...prev, dateFrom: mStart, dateTo: todayISO() }))
                }}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 600 }}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  const d30 = new Date()
                  d30.setDate(d30.getDate() - 30)
                  setDateExportModal((prev) => ({ ...prev, dateFrom: d30.toISOString().slice(0, 10), dateTo: todayISO() }))
                }}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 600 }}
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => setDateExportModal((prev) => ({ ...prev, dateFrom: '', dateTo: '' }))}
                style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 600 }}
              >
                All Dates
              </button>
            </div>

            {/* Calendar Date Inputs: From Date & To Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', display: 'block', marginBottom: 5 }}>
                  📅 From Date (इस तारीख से):
                </label>
                <Input
                  type="date"
                  value={dateExportModal.dateFrom}
                  max={dateExportModal.dateTo || todayISO()}
                  onChange={(e) => setDateExportModal((prev) => ({ ...prev, dateFrom: e.target.value }))}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', display: 'block', marginBottom: 5 }}>
                  📅 To Date (इस तारीख तक):
                </label>
                <Input
                  type="date"
                  value={dateExportModal.dateTo}
                  min={dateExportModal.dateFrom}
                  max={todayISO()}
                  onChange={(e) => setDateExportModal((prev) => ({ ...prev, dateTo: e.target.value }))}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>
            </div>

            {/* Real-time Records Count Preview */}
            {(() => {
              const query = filters.search.trim().toLowerCase()
              const count = photoRows.filter((p) => {
                if (dateExportModal.dateFrom && p.date < dateExportModal.dateFrom) return false
                if (dateExportModal.dateTo && p.date > dateExportModal.dateTo) return false
                if (filters.area && String(p.area) !== String(filters.area)) return false
                if (filters.worker && String(p.worker) !== String(filters.worker)) return false
                if (filters.task && String(p.task_type) !== String(filters.task)) return false
                if (!query) return true
                return [
                  p.area_name,
                  p.worker_name,
                  p.task_type_name,
                  p.session,
                  p.note,
                  p.assigned_by_name,
                  p.completed_by_name,
                  p.supervisor_name,
                ].some((val) => String(val || '').toLowerCase().includes(query))
              }).length

              return (
                <div
                  style={{
                    background: count > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: count > 0 ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: count > 0 ? '#15803d' : '#b91c1c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <span>
                    {count > 0 ? `✔ Found ${count} photo log record(s) in selected range` : '⚠️ No photo log records found in this date range'}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>
                    Columns: Date, Type, Session, Worker, Area, Task, Assigned By, Photo URL...
                  </span>
                </div>
              )
            })()}

            {/* Download Format Buttons */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Download Tabular Report (Without Photos):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => handleExportPhotoLog('pdf', dateExportModal.dateFrom, dateExportModal.dateTo)}
                  style={{
                    background: '#1a3c34',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 2px 6px rgba(26,60,52,0.25)',
                  }}
                >
                  📄 Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleExportPhotoLog('excel', dateExportModal.dateFrom, dateExportModal.dateTo)}
                  style={{
                    background: '#15803d',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 2px 6px rgba(21,128,61,0.25)',
                  }}
                >
                  📊 Download Excel
                </button>
                <button
                  type="button"
                  onClick={() => handleExportPhotoLog('csv', dateExportModal.dateFrom, dateExportModal.dateTo)}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 2px 6px rgba(2,132,199,0.25)',
                  }}
                >
                  📋 Download CSV
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
