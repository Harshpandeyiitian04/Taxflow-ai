'use client'

import { useState } from 'react'
import { UploadZone } from '@/components/extraction/UploadZone'
import { ExtractionResult } from '@/components/extraction/ExtractionResult'
import type { DocumentType } from '@/types'

type State = 'idle' | 'extracting' | 'done' | 'error'

const DOC_TYPES: Array<{ value: DocumentType; label: string; desc: string }> = [
  { value: 'form16', label: 'Form 16', desc: 'Salary, deductions, tax computation, and TDS' },
  { value: 'bank_statement', label: 'Bank statement', desc: 'Salary credits, interest, TDS, and major transactions' },
  { value: 'ais', label: 'AIS / 26AS', desc: 'Income sources, capital gains, SFT, and tax credits' },
  { value: 'form16a', label: 'Form 16A', desc: 'Deductor, section, payment, and TDS summary' },
  { value: 'capital_gains', label: 'Capital gains', desc: 'Investment transactions, holding periods, STCG, and LTCG' },
]

const EXTRACTED_FIELDS: Record<DocumentType, string[]> = {
  form16: ['Employer and employee identity', 'Salary and allowances', 'Chapter VI-A deductions', 'Tax computation and quarterly TDS'],
  bank_statement: ['Salary credits', 'Interest and TDS', 'Other income credits', 'Large transactions'],
  ais: ['Salary and interest', 'Dividends and capital gains', 'SFT transactions', 'TDS/TCS summary'],
  form16a: ['Deductor and deductee', 'TDS section and period', 'Payment rows', 'Tax deducted and deposited'],
  capital_gains: ['Asset and transaction details', 'Purchase and sale values', 'Holding period', 'STCG/LTCG summary'],
}

export default function ExtractPage() {
  const [state, setState] = useState<State>('idle')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [filename, setFilename] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [docType, setDocType] = useState<DocumentType>('form16')

  async function handleFileSelect(file: File) {
    setState('extracting')
    setFilename(file.name)
    setErrorMsg('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('docType', docType)
    // No clientId here — this is the standalone test extractor
    // When integrated with client flow (Day 11), clientId will be passed

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Extraction failed')
      }

      setResult(json.data)
      if (json.remaining !== null) setRemaining(json.remaining)
      setState('done')
    } catch (err: unknown) {
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  function reset() {
    setState('idle')
    setResult(null)
    setFilename('')
    setErrorMsg('')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </a>
            <span className="text-gray-300">/</span>
              <span className="text-gray-900 font-medium text-sm">Document extractor</span>
          </div>
          {remaining !== null && (
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${
              remaining > 2
                ? 'bg-green-50 text-green-700'
                : remaining > 0
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-600'
            }`}>
              {remaining} free extraction{remaining !== 1 ? 's' : ''} remaining
            </span>
          )}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {state === 'idle' || state === 'extracting' ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">AI document extractor</h1>
              <p className="text-gray-500">
                Upload a supported tax document and review extracted values before using them.
                <br />Works with PDFs, scanned copies, and clear photos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {DOC_TYPES.map(type => (
                <button key={type.value} type="button" onClick={() => setDocType(type.value)}
                  aria-pressed={docType === type.value}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${docType === type.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}>
                  {type.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-5">
              {DOC_TYPES.find(type => type.value === docType)?.desc}
            </p>
            <UploadZone
              onFileSelect={handleFileSelect}
              isLoading={state === 'extracting'}
            />
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-blue-800 mb-2">What gets extracted</p>
              <div className="grid grid-cols-2 gap-1">
                {EXTRACTED_FIELDS[docType].map(f => (
                  <div key={f} className="flex items-center gap-1.5 text-sm text-blue-700">
                    <span className="text-green-500">✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : state === 'done' && result ? (
          <ExtractionResult
            data={result}
            filename={filename}
            onReset={reset}
          />
        ) : state === 'error' ? (
          <div className="max-w-2xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h2 className="text-lg font-bold text-red-900 mb-2">Extraction failed</h2>
              <p className="text-red-700 mb-6">{errorMsg}</p>
              <button
                onClick={reset}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}