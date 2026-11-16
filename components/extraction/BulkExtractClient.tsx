'use client'

// Upload and process many Form 16 files in small batches.

import { useRef, useState } from 'react'
import Link from 'next/link'
import { generateForm16CSV } from '@/lib/utils/export'
import { csvSafeRow } from '@/lib/utils/csvSafe'
import { MAX_UPLOAD_MB } from '@/lib/constants'

interface BulkResult {
  filename: string
  status: 'pending' | 'processing' | 'done' | 'error'
  data?: Record<string, unknown>
  error?: string
}

// Turns unknown JSON into a plain key-value object.
function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

// Manages multi-file queue, progress, and CSV export.
export function BulkExtractClient() {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<BulkResult[]>([])
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Validates selected files and builds the pending results list.
  function handleFiles(selected: FileList | null) {
    if (!selected) return
    setNotice('')
    if (selected.length > 50) {
      setNotice('Bulk extraction supports up to 50 files at a time.')
    }
    const limited = Array.from(selected).slice(0, 50)
    const arr = limited.filter(f =>
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type)
      && f.size <= MAX_UPLOAD_MB * 1024 * 1024
    )
    if (limited.length > 0 && arr.length < limited.length) {
      setNotice(`Some files were skipped (wrong type or over ${MAX_UPLOAD_MB} MB).`)
    }
    setFiles(arr)
    setResults(arr.map(f => ({ filename: f.name, status: 'pending' })))
  }

  // Runs extraction API calls in batches of three.
  async function runBulk(retryFailedOnly: boolean) {
    if (!files.length || running) return
    const indices = results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => retryFailedOnly ? r.status === 'error' : r.status === 'pending' || r.status === 'error')
      .map(({ i }) => i)

    if (!indices.length) return

    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setNotice('')

    const BATCH_SIZE = 3
    for (let offset = 0; offset < indices.length; offset += BATCH_SIZE) {
      if (controller.signal.aborted) break
      const batchIndices = indices.slice(offset, offset + BATCH_SIZE)

      setResults(prev => prev.map((r, idx) =>
        batchIndices.includes(idx) ? { ...r, status: 'processing', error: undefined } : r
      ))

      await Promise.allSettled(
        batchIndices.map(async (globalIdx) => {
          if (controller.signal.aborted) return
          const file = files[globalIdx]
          const formData = new FormData()
          formData.append('file', file)
          formData.append('docType', 'form16')

          try {
            const res = await fetch('/api/extract', {
              method: 'POST',
              body: formData,
              signal: controller.signal,
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || 'Extraction failed')

            setResults(prev => prev.map((r, idx) =>
              idx === globalIdx ? { ...r, status: 'done', data: json.data, error: undefined } : r
            ))
          } catch (err: unknown) {
            if (controller.signal.aborted) return
            setResults(prev => prev.map((r, idx) =>
              idx === globalIdx
                ? { ...r, status: 'error', error: err instanceof Error ? err.message : 'Extraction failed' }
                : r
            ))
          }
        })
      )

      if (!controller.signal.aborted && offset + BATCH_SIZE < indices.length) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    setRunning(false)
    abortRef.current = null
  }

  // Stops in-flight extractions and resets processing rows.
  function cancelRun() {
    abortRef.current?.abort()
    setRunning(false)
    setResults(prev => prev.map(r =>
      r.status === 'processing' ? { ...r, status: 'pending' } : r
    ))
    setNotice('Bulk extraction cancelled.')
  }

  // Downloads one CSV summary of all successful extractions.
  function exportAll() {
    const completed = results.filter(r => r.status === 'done' && r.data)
    if (!completed.length) return

    const rows: string[] = [
      csvSafeRow(['Client File', 'Employer Name', 'Employee Name', 'Employee PAN', 'Gross Salary', 'TDS Deducted', 'Net Taxable Income', 'Total VI-A Deductions']),
    ]
    completed.forEach(r => {
      const d = getRecord(r.data)
      const employer = getRecord(d.employer)
      const employee = getRecord(d.employee)
      const income = getRecord(d.income)
      const tds = getRecord(d.tds)
      const tax = getRecord(d.tax_computation)
      const deductions = getRecord(d.deductions_vi_a)
      rows.push(csvSafeRow([
        r.filename.replace('.pdf', ''),
        employer.name ?? '',
        employee.name ?? '',
        employee.pan ?? '',
        income.gross_salary ?? '',
        tds.total_tds_deducted ?? '',
        tax.total_income_after_deductions ?? '',
        deductions.total_chapter_vi_a ?? '',
      ]))
    })

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `bulk_extraction_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const doneCount = results.filter(r => r.status === 'done').length
  const errorCount = results.filter(r => r.status === 'error').length
  const pendingCount = results.filter(r => r.status === 'pending').length
  const canStart = pendingCount > 0 && doneCount === 0 && errorCount === 0
  const canRetry = errorCount > 0
  const primaryDisabled = running || (!canStart && !canRetry)

  let primaryLabel = 'Extract all'
  if (running) primaryLabel = 'Processing...'
  else if (canRetry && pendingCount === 0) primaryLabel = `Retry failed (${errorCount})`
  else if (canRetry && pendingCount > 0) primaryLabel = `Continue (${pendingCount + errorCount})`
  else if (doneCount === files.length && files.length > 0) primaryLabel = 'All done'

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium">Bulk Form 16 extraction</span>
          </div>
          {doneCount > 0 && (
            <button type="button" onClick={exportAll}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Export all {doneCount} as CSV
            </button>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {notice && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
            {notice}
          </div>
        )}

        {!files.length ? (
          <label
            htmlFor="bulk-file-input"
            className="block border-2 border-dashed border-gray-300 rounded-2xl p-16 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors focus-within:ring-2 focus-within:ring-green-500"
          >
            <input
              id="bulk-file-input"
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              className="sr-only"
              onChange={e => handleFiles(e.target.files)}
            />
            <p className="text-lg font-semibold text-gray-900 mb-2">
              Upload multiple Form 16 PDFs
            </p>
            <p className="text-sm text-gray-500">
              Select 1–50 files · Max {MAX_UPLOAD_MB} MB each · Processed in batches of 3
            </p>
          </label>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-gray-900">{files.length} files selected</p>
                {running && (
                  <p className="text-sm text-green-700 mt-0.5">
                    Processing {results.filter(r => r.status === 'processing').length} now...
                  </p>
                )}
                {!running && (doneCount > 0 || errorCount > 0) && (
                  <p className="text-sm text-gray-600 mt-0.5">
                    {doneCount} done · {errorCount} failed · {pendingCount} pending
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {!running && doneCount === 0 && errorCount === 0 && (
                  <button
                    type="button"
                    onClick={() => { setFiles([]); setResults([]); setNotice('') }}
                    className="text-sm text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
                    Clear
                  </button>
                )}
                {running && (
                  <button
                    type="button"
                    onClick={cancelRun}
                    className="text-sm text-red-600 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-50">
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runBulk(canRetry && pendingCount === 0)}
                  disabled={primaryDisabled}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                >
                  {primaryLabel}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={`${r.filename}-${i}`} className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500 w-20 shrink-0 capitalize">{r.status}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.filename}</p>
                    {r.status === 'done' && r.data && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {String(getRecord(r.data.employee).name ?? '—')} ·
                        ₹{Number(getRecord(r.data.income).gross_salary ?? 0).toLocaleString('en-IN')} gross
                      </p>
                    )}
                    {r.status === 'error' && (
                      <p className="text-xs text-red-500 mt-0.5">{r.error}</p>
                    )}
                  </div>
                  {r.status === 'done' && r.data && (
                    <button
                      type="button"
                      onClick={() => generateForm16CSV(r.data!, r.filename)}
                      className="text-xs text-green-600 hover:text-green-800 px-2.5 py-1 rounded-lg border border-green-200 hover:border-green-300">
                      CSV
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800 mb-1">Rate limit note</p>
          <p className="text-sm text-amber-700">
            Bulk processing uses 3 extractions at a time with a 2-second pause between batches.
            Completed files are never re-run. Use Retry failed for errors only.
          </p>
        </div>
      </main>
    </div>
  )
}
