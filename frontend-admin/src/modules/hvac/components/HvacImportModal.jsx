import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Modal, Btn, Spinner, Alert } from '../../../components/ui';
import HvacApi from '../hvacApi';

export default function HvacImportModal({ open, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'history'
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [validating, setValidating] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);
  const [showErrorsList, setShowErrorsList] = useState(false);

  // Undo state
  const [undoing, setUndoing] = useState(false);
  const [undoMessage, setUndoMessage] = useState(null);
  const [confirmUndoBatchId, setConfirmUndoBatchId] = useState(null);

  // Import history state
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fileInputRef = useRef(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await HvacApi.getImportHistory();
      if (res?.ok && Array.isArray(res.batches)) {
        setHistoryList(res.batches);
      }
    } catch (err) {
      console.warn('Failed to load import history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      if (activeTab === 'history') {
        loadHistory();
      }
    }
  }, [open, activeTab, loadHistory]);

  const resetState = () => {
    setFile(null);
    setValidating(false);
    setPreviewData(null);
    setImporting(false);
    setImportResult(null);
    setError(null);
    setShowErrorsList(false);
    setUndoing(false);
    setUndoMessage(null);
    setConfirmUndoBatchId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    const name = selectedFile.name.toLowerCase();
    const isValidExt = name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');

    if (!isValidExt) {
      setError('Please select a valid Excel (.xlsx, .xls) or CSV (.csv) file.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setPreviewData(null);
    setImportResult(null);
    setUndoMessage(null);
    setValidating(true);

    try {
      const res = await HvacApi.importData(selectedFile, true);
      if (res.ok) {
        setPreviewData(res);
      } else {
        setError(res.error || 'Failed to validate file structure.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Validation request failed.';
      setError(msg);
    } finally {
      setValidating(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDownloadTemplate = async (format) => {
    try {
      await HvacApi.downloadTemplate(format);
    } catch (err) {
      setError('Failed to download template. Please check connection.');
    }
  };

  const handleExecuteImport = async () => {
    if (!file || !previewData || previewData.valid_rows <= 0) return;
    setImporting(true);
    setError(null);
    setUndoMessage(null);

    try {
      const res = await HvacApi.importData(file, false);
      if (res.ok) {
        setImportResult(res);
        if (onSuccess) {
          onSuccess(res);
        }
      } else {
        setError(res.error || 'Failed to ingest records.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to import records.';
      setError(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleExecuteUndo = async (batchId) => {
    setUndoing(true);
    setError(null);
    setUndoMessage(null);

    try {
      const res = await HvacApi.undoImport(batchId);
      if (res.ok) {
        setUndoMessage(res.message);
        setConfirmUndoBatchId(null);
        if (importResult && importResult.batch_id === batchId) {
          setImportResult((prev) => (prev ? { ...prev, reverted: true } : null));
        }
        // Refresh history if open
        loadHistory();
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(res.error || 'Failed to undo import.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Undo request failed.';
      setError(msg);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="HVAC Historical Telemetry Data Ingestion"
      width={780}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <Btn variant="secondary" onClick={handleClose} disabled={importing || undoing}>
            {importResult ? 'Close' : 'Cancel'}
          </Btn>
          <div style={{ display: 'flex', gap: 10 }}>
            {activeTab === 'upload' && !importResult && (
              <Btn
                variant="primary"
                style={{ background: '#0f766e' }}
                onClick={handleExecuteImport}
                disabled={!previewData || previewData.valid_rows <= 0 || validating || importing}
              >
                {importing ? (
                  <>
                    <Spinner size={14} /> Ingesting Data...
                  </>
                ) : previewData?.valid_rows ? (
                  `Confirm & Ingest ${previewData.valid_rows} Records`
                ) : (
                  'Import Telemetry Data'
                )}
              </Btn>
            )}
            {importResult && (
              <Btn
                variant="primary"
                style={{ background: '#0f766e' }}
                onClick={handleClose}
              >
                Done
              </Btn>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Navigation Tabs inside Modal: Upload vs History & Undo */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            gap: 20,
            paddingBottom: 2,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'upload' ? '2.5px solid #0f766e' : '2.5px solid transparent',
              color: activeTab === 'upload' ? '#0f766e' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'upload' ? 700 : 500,
              fontSize: 13,
              padding: '6px 4px 10px 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>📤</span> Upload & Dry-Run Preview
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              loadHistory();
            }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'history' ? '2.5px solid #0f766e' : '2.5px solid transparent',
              color: activeTab === 'history' ? '#0f766e' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'history' ? 700 : 500,
              fontSize: 13,
              padding: '6px 4px 10px 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>🕒</span> Import History & 1-Click Undo
          </button>
        </div>

        {error && <Alert message={error} type="error" />}

        {undoMessage && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1.5px solid #22c55e',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 13,
              color: '#15803d',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 600,
            }}
          >
            <span>✅</span>
            <span>{undoMessage}</span>
          </div>
        )}

        {/* TAB 1: UPLOAD & PREVIEW */}
        {activeTab === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Standard Template Download Header */}
            <div
              style={{
                background: 'rgba(15, 118, 110, 0.06)',
                border: '1px solid rgba(15, 118, 110, 0.22)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f766e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📊</span> Standardized Excel & CSV Telemetry Templates
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2, #64748b)', marginTop: 2 }}>
                  Pre-formatted column headers for Chillers 1–7, Primary/Secondary/Condenser Pumps, Towers & Meters.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate('xlsx')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#0f766e',
                    border: '1px solid #0f766e',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '6px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Download formatted Excel (.xlsx) template with sample rows"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Excel Template (.xlsx)
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadTemplate('csv')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#ffffff',
                    border: '1.5px solid #0f766e',
                    color: '#0f766e',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '6px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Download raw CSV (.csv) template"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  CSV (.csv)
                </button>
              </div>
            </div>

            {/* Success Banner with Instant Undo Option */}
            {importResult && (
              <div
                style={{
                  background: importResult.reverted ? '#f8fafc' : '#ecfdf5',
                  border: `1.5px solid ${importResult.reverted ? '#cbd5e1' : '#10b981'}`,
                  borderRadius: 12,
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>
                  {importResult.reverted ? '↺' : '✅'}
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: importResult.reverted ? '#475569' : '#065f46' }}>
                  {importResult.reverted ? 'Import Was Reverted / Undone' : 'Import Completed Successfully!'}
                </div>
                <div style={{ fontSize: 13, color: importResult.reverted ? '#64748b' : '#047857', marginTop: 4 }}>
                  {importResult.reverted
                    ? 'All records from this upload were deleted and previous states restored.'
                    : importResult.message}
                </div>

                {!importResult.reverted && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                      <div style={{ background: '#fff', padding: '6px 14px', borderRadius: 8, border: '1px solid #a7f3d0', fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                        Total Ingested: <strong>{importResult.imported_count}</strong>
                      </div>
                      <div style={{ background: '#fff', padding: '6px 14px', borderRadius: 8, border: '1px solid #a7f3d0', fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                        New: <strong>{importResult.created_count ?? 0}</strong> • Updated: <strong>{importResult.updated_count ?? 0}</strong>
                      </div>
                      <div style={{ background: '#fff', padding: '6px 14px', borderRadius: 8, border: '1px solid #a7f3d0', fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                        Dates: <strong>{importResult.date_min}</strong> → <strong>{importResult.date_max}</strong>
                      </div>
                    </div>

                    {/* Instant Undo Action Button */}
                    <div
                      style={{
                        marginTop: 18,
                        paddingTop: 16,
                        borderTop: '1px dashed #a7f3d0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {confirmUndoBatchId === importResult.batch_id ? (
                        <div
                          style={{
                            background: '#fff1f2',
                            border: '1.5px solid #f43f5e',
                            borderRadius: 10,
                            padding: '12px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9f1239' }}>
                            ⚠️ Confirm Undo: Roll back this entire upload?
                          </div>
                          <div style={{ fontSize: 11.5, color: '#be123c', maxWidth: 440, textAlign: 'center' }}>
                            This will permanently delete all {importResult.created_count ?? 0} newly created logs and restore any overwritten historical data.
                          </div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => setConfirmUndoBatchId(null)}
                              disabled={undoing}
                              style={{
                                padding: '5px 12px',
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                                background: '#fff',
                                color: '#475569',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExecuteUndo(importResult.batch_id)}
                              disabled={undoing}
                              style={{
                                padding: '5px 14px',
                                borderRadius: 6,
                                border: 'none',
                                background: '#e11d48',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {undoing ? <Spinner size={12} /> : 'Yes, Undo & Rollback'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmUndoBatchId(importResult.batch_id)}
                          style={{
                            background: '#fff',
                            border: '1.5px solid #f43f5e',
                            color: '#e11d48',
                            fontSize: 12.5,
                            fontWeight: 700,
                            padding: '7px 16px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            transition: 'all 0.15s ease',
                          }}
                          title="Click to immediately revert this import if anything was incorrect"
                        >
                          <span style={{ fontSize: 14 }}>↺</span> Incorrect Upload? Undo This Import
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Drag & Drop Upload Dropzone */}
            {!importResult && (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx, .xls, .csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? '#0f766e' : file ? '#10b981' : 'var(--border, #cbd5e1)'}`,
                    background: dragOver ? 'rgba(15, 118, 110, 0.05)' : file ? 'rgba(16, 185, 129, 0.03)' : 'var(--surface-2, #f8fafc)',
                    borderRadius: 12,
                    padding: '28px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: 34, marginBottom: 8 }}>
                    {file ? '📊' : '📥'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text, #1e293b)' }}>
                    {file ? file.name : 'Click to select or drag and drop your Excel / CSV file'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
                    {file
                      ? `${(file.size / 1024).toFixed(1)} KB • Click to choose a different spreadsheet`
                      : 'Accepts Excel workbooks (.xlsx, .xls) and CSV (.csv) logs'}
                  </div>
                </div>
              </div>
            )}

            {/* Validating Spinner */}
            {validating && (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <Spinner />
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: '#0f766e' }}>
                  Validating spreadsheet columns, date formats, and telemetry metrics...
                </div>
              </div>
            )}

            {/* Dry-run Validation Results & Preview */}
            {!importResult && previewData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 4 Stat Badges */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 10,
                  }}
                >
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Rows</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{previewData.total_rows}</div>
                  </div>

                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: '#047857', fontWeight: 600, textTransform: 'uppercase' }}>Valid Records</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#065f46', marginTop: 2 }}>{previewData.valid_rows}</div>
                  </div>

                  <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: '#0f766e', fontWeight: 600, textTransform: 'uppercase' }}>Date Range</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#134e4a', marginTop: 4 }}>
                      {previewData.date_min ? `${previewData.date_min} → ${previewData.date_max}` : 'N/A'}
                    </div>
                  </div>

                  <div style={{ background: previewData.invalid_rows ? '#fff7ed' : '#f8fafc', border: `1px solid ${previewData.invalid_rows ? '#fed7aa' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: previewData.invalid_rows ? '#c2410c' : '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Invalid / Skipped</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: previewData.invalid_rows ? '#ea580c' : '#64748b', marginTop: 2 }}>
                      {previewData.invalid_rows}
                    </div>
                  </div>
                </div>

                {/* Warning / Error Alert Dropdown */}
                {previewData.errors && previewData.errors.length > 0 && (
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: 10,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>⚠️</span> {previewData.errors.length} rows have formatting issues and will be skipped
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowErrorsList(!showErrorsList)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#b45309',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {showErrorsList ? 'Hide Details' : 'View Details'}
                      </button>
                    </div>
                    {showErrorsList && (
                      <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 11, color: '#78350f', maxHeight: 120, overflowY: 'auto' }}>
                        {previewData.errors.map((err, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>{err}</li>
                        ))}
                        {previewData.has_more_errors && <li>...and more.</li>}
                      </ul>
                    )}
                  </div>
                )}

                {/* Sample Logs Preview Table */}
                {previewData.sample_logs && previewData.sample_logs.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2, #64748b)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>👀</span> Sample Telemetry Rows Preview (First {previewData.sample_logs.length} Rows)
                    </div>
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8 }}>
                      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2, #f1f5f9)', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Log ID</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Date</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Time</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Shift</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Operator</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Chiller Metrics</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Total Telemetry Keys</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.sample_logs.map((log, idx) => {
                            const vals = log.v || {};
                            const chillerKeys = Object.keys(vals).filter((k) => k.startsWith('c') && k.includes('_'));
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{log.id}</td>
                                <td style={{ padding: '6px 10px' }}>{log.date}</td>
                                <td style={{ padding: '6px 10px' }}>{log.time}</td>
                                <td style={{ padding: '6px 10px' }}>Shift {log.shift}</td>
                                <td style={{ padding: '6px 10px' }}>{log.operator || '—'}</td>
                                <td style={{ padding: '6px 10px' }}>
                                  {chillerKeys.length > 0 ? `${chillerKeys.length} metrics` : 'None'}
                                </td>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#0f766e' }}>
                                  {Object.keys(vals).length} fields
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: IMPORT HISTORY & 1-CLICK UNDO */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-2, #64748b)' }}>
                View past upload batches and revert any erroneous imports.
              </div>
              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                style={{
                  background: 'none',
                  border: '1px solid var(--border, #cbd5e1)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {loadingHistory ? <Spinner size={11} /> : '↻ Refresh'}
              </button>
            </div>

            {loadingHistory && !historyList.length ? (
              <div style={{ padding: 30, textAlign: 'center' }}>
                <Spinner />
                <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Loading import history...</div>
              </div>
            ) : historyList.length === 0 ? (
              <div
                style={{
                  padding: '30px 20px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: 10,
                  border: '1px dashed #cbd5e1',
                  color: '#64748b',
                  fontSize: 13,
                }}
              >
                No historical imports found yet. Files you import will appear here with rollback support.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10 }}>
                <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2, #f8fafc)', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Timestamp / Batch</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>File Name</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Records</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Date Range</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Imported By</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700 }}>Status</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Rollback Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyList.map((batch) => {
                      const isActive = batch.status === 'active';
                      const isConfirming = confirmUndoBatchId === batch.batch_id;
                      const formattedTime = batch.created_at
                        ? new Date(batch.created_at).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '—';

                      return (
                        <tr key={batch.batch_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text, #1e293b)' }}>{formattedTime}</div>
                            <div style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#64748b' }}>{batch.batch_id}</div>
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{batch.filename || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <strong>{batch.total_records}</strong>
                            <span style={{ fontSize: 10.5, color: '#64748b', display: 'block' }}>
                              +{batch.created_count ?? 0} new, ~{batch.updated_count ?? 0} upd
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {batch.date_min ? `${batch.date_min} → ${batch.date_max}` : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>{batch.imported_by || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            {isActive ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  border: '1px solid #a7f3d0',
                                  borderRadius: 6,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                Active
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-block',
                                  background: '#f1f5f9',
                                  color: '#64748b',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: 6,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                Reverted
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            {isActive ? (
                              isConfirming ? (
                                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmUndoBatchId(null)}
                                    disabled={undoing}
                                    style={{
                                      padding: '3px 8px',
                                      fontSize: 11,
                                      borderRadius: 5,
                                      border: '1px solid #cbd5e1',
                                      background: '#fff',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleExecuteUndo(batch.batch_id)}
                                    disabled={undoing}
                                    style={{
                                      padding: '3px 10px',
                                      fontSize: 11,
                                      borderRadius: 5,
                                      border: 'none',
                                      background: '#e11d48',
                                      color: '#fff',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    {undoing ? <Spinner size={10} /> : 'Confirm'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmUndoBatchId(batch.batch_id)}
                                  style={{
                                    background: '#fff',
                                    border: '1px solid #fca5a5',
                                    color: '#dc2626',
                                    borderRadius: 6,
                                    padding: '4px 10px',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                  title="Revert and rollback this batch"
                                >
                                  ↺ Undo
                                </button>
                              )
                            ) : (
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                Reverted
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
