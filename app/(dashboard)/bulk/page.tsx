'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { generateForm16CSV } from '@/lib/utils/export'

interface BulkResult {
  filename: string
  status: 'pending' | 'processing' | 'done' | 'error'
  data?: Record<string, unknown>
  error?: string
}

function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export default function BulkExtractPage() {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<BulkResult[]>([])
  const [running, setRunning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    if (selected.length > 50) alert('Bulk extraction supports up to 50 files at a time.')
    const arr = Array.from(selected).slice(0, 50).filter(f =>
      ['application/pdf','image/jpeg','image/png','image/webp'].includes(f.type)
    )
    setFiles(arr)
    setResults(arr.map(f => ({ filename: f.name, status: 'pending' })))
  }

  async function runBulk() {
    if (!files.length || running) return
    setRunning(true)

    // Process in batches of 3 to respect Gemini rate limits
    const BATCH_SIZE = 3

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)

      // Mark batch as processing
      setResults(prev => prev.map((r, idx) =>
        idx >= i && idx < i + BATCH_SIZE ? { ...r, status: 'processing' } : r
      ))

      // Process batch in parallel
      await Promise.allSettled(
        batch.map(async (file, batchIdx) => {
          const globalIdx = i + batchIdx
          const formData = new FormData()
          formData.append('file', file)
          formData.append('docType', 'form16')

          try {
            const res = await fetch('/api/extract', { method: 'POST', body: formData })
            const json = await res.json()

            if (!res.ok) throw new Error(json.error)

            setResults(prev => prev.map((r, idx) =>
              idx === globalIdx ? { ...r, status: 'done', data: json.data } : r
            ))
          } catch (err: unknown) {
            setResults(prev => prev.map((r, idx) =>
              idx === globalIdx ? { ...r, status: 'error', error: err instanceof Error ? err.message : 'Extraction failed' } : r
            ))
          }
        })
      )

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < files.length) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    setRunning(false)
  }

  function exportAll() {
    const completed = results.filter(r => r.status === 'done' && r.data)
    if (!completed.length) return

    // Combine all into one CSV
    const rows: string[] = ['Client File,Employer Name,Employee Name,Employee PAN,Gross Salary,TDS Deducted,Net Taxable Income,Total VI-A Deductions']
    completed.forEach(r => {
      const d = getRecord(r.data)
      const employer = getRecord(d.employer)
      const employee = getRecord(d.employee)
      const income = getRecord(d.income)
      const tds = getRecord(d.tds)
      const tax = getRecord(d.tax_computation)
      const deductions = getRecord(d.deductions_vi_a)
      rows.push([
        r.filename.replace('.pdf',''),
        employer.name ?? '',
        employee.name ?? '',
        employee.pan ?? '',
        income.gross_salary ?? '',
        tds.total_tds_deducted ?? '',
        tax.total_income_after_deductions ?? '',
        deductions.total_chapter_vi_a ?? '',
      ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    })

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `bulk_extraction_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const doneCount = results.filter(r => r.status === 'done').length
  const errorCount = results.filter(r => r.status === 'error').length

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
            <button onClick={exportAll}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              ⬇ Export all {doneCount} as CSV
            </button>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Upload zone */}
        {!files.length ? (
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-2xl p-16 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            <div className="text-4xl mb-4">📁</div>
            <p className="text-lg font-semibold text-gray-900 mb-2">
              Upload multiple Form 16 PDFs
            </p>
            <p className="text-sm text-gray-500">
              Select 1–50 files at once · Processed in batches of 3
            </p>
          </div>
        ) : (
          <div>
            {/* Control bar */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="font-semibold text-gray-900">{files.length} files selected</p>
                {running && (
                  <p className="text-sm text-purple-600 mt-0.5">
                    Processing {results.filter(r => r.status === 'processing').length} now...
                  </p>
                )}
                {!running && doneCount > 0 && (
                  <p className="text-sm text-green-600 mt-0.5">
                    {doneCount} done · {errorCount} errors
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {!running && doneCount === 0 && (
                  <button
                    onClick={() => { setFiles([]); setResults([]) }}
                    className="text-sm text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
                    Clear
                  </button>
                )}
                <button
                  onClick={runBulk}
                  disabled={running || doneCount === files.length}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                >
                  {running ? 'Processing...' : doneCount > 0 ? 'Done' : 'Extract all'}
                </button>
              </div>
            </div>

            {/* Results list */}
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-3">
                  <span className="text-lg">
                    {r.status === 'pending' ? '⏳'
                     : r.status === 'processing' ? '🔄'
                     : r.status === 'done' ? '✅'
                     : '❌'}
                  </span>
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
            Each PDF uses one Gemini request. A 50-PDF batch can take several minutes depending on API rate limits.
          </p>
        </div>
      </main>
    </div>
  )
}