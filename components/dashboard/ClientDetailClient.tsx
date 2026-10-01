'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExtractionResult } from '@/components/extraction/ExtractionResult'
import { UploadLinkModal } from '@/components/clients/UploadLinkModal'
import { TagEditor } from '@/components/clients/TagEditor'
import { NotesEditor } from '@/components/clients/NotesEditor'
import type { CAFirm, Client, ClientStatus } from '@/types'

interface Document {
  id: string
  type: string
  original_filename: string | null
  extraction_status: string
  extracted_data: Record<string, unknown> | null
  extraction_error: string | null
  file_size_bytes: number | null
  created_at: string
}

interface ClientFull extends Client {
  documents: Document[]
}

interface Props {
  client: ClientFull
  firm: CAFirm
  uploadUrl: string | null
}

const DOC_TYPE_LABELS: Record<string, string> = {
  form16: 'Form 16',
  bank_statement: 'Bank Statement',
  ais: 'AIS / 26AS',
  form16a: 'Form 16A',
  capital_gains: 'Capital Gains',
  other: 'Other',
}

const STATUS_STEPS: ClientStatus[] = ['pending', 'received', 'processing', 'done', 'filed']

export function ClientDetailClient({ client: initialClient, firm, uploadUrl }: Props) {
  const [client, setClient] = useState(initialClient)
  const [expandedDoc, setExpandedDoc] = useState<string | null>(
    // Auto-expand the first completed document
    initialClient.documents.find(d => d.extraction_status === 'completed')?.id ?? null
  )
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [fee, setFee] = useState(client.fee_amount == null ? '' : String(client.fee_amount))
  const [feePaid, setFeePaid] = useState(client.fee_paid)
  const [gstin, setGstin] = useState(client.gstin ?? '')
  const [gstScheme, setGstScheme] = useState(client.gst_scheme ?? 'monthly')
  const [savingDetails, setSavingDetails] = useState(false)

  async function saveClientFields(updates: Partial<Pick<ClientFull,
    'notes' | 'tags' | 'fee_amount' | 'fee_paid' | 'gstin' | 'gst_scheme'>>) {
    setSavingDetails(true)
    const response = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const result = await response.json()
    if (!response.ok) {
      alert(result.error || 'Could not save client details')
      setSavingDetails(false)
      return
    }
    setClient(current => ({ ...current, ...result.client }))
    setSavingDetails(false)
  }

  async function saveFee() {
    await saveClientFields({ fee_amount: fee ? Number(fee) : null, fee_paid: feePaid })
  }

  async function saveGSTDetails(event: React.FormEvent) {
    event.preventDefault()
    await saveClientFields({ gstin: gstin.trim() || null, gst_scheme: gstScheme })
  }

  async function updateStatus(newStatus: ClientStatus) {
    setUpdatingStatus(true)
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      const data = await res.json()
      setClient(prev => ({ ...prev, status: data.client.status }))
    }
    setUpdatingStatus(false)
  }

  const firmName = firm.firm_name || firm.owner_name || 'Your firm'
  const currentStepIndex = STATUS_STEPS.indexOf(client.status)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-medium truncate max-w-50">{client.name}</span>
          </div>
          <span className="text-sm text-gray-400 hidden sm:block">{firmName}</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Client header card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl font-bold text-blue-700">
                {client.name.charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
                <div className="flex flex-wrap gap-2 mt-1">
                  {client.pan && <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{client.pan}</span>}
                  {client.phone && <span className="text-xs text-gray-500">{client.phone}</span>}
                  {client.email && <span className="text-xs text-gray-500">{client.email}</span>}
                  <span className="text-xs text-gray-500">{client.assessment_year ? `AY ${client.assessment_year}` : 'AY not set'}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {uploadUrl && (
                <button onClick={() => setShowLinkModal(true)}
                  className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 border border-green-200 px-4 py-2 rounded-xl hover:bg-green-100 transition-colors font-medium">
                  Share upload link
                </button>
              )}
              {client.status !== 'filed' && (
                <button
                  onClick={() => updateStatus('filed')}
                  disabled={updatingStatus}
                  className="flex items-center gap-1.5 text-sm text-gray-700 bg-white border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors font-medium disabled:opacity-50">
                  {updatingStatus ? 'Saving...' : '✓ Mark as filed'}
                </button>
              )}
            </div>
          </div>

          {/* Status progress bar */}
          <div className="mt-5">
            <div className="flex items-center gap-0">
              {STATUS_STEPS.map((step, idx) => {
                const isComplete = idx <= currentStepIndex
                const isCurrent = idx === currentStepIndex
                const labels: Record<ClientStatus, string> = {
                  pending: 'Pending', received: 'Docs received',
                  processing: 'Processing', done: 'Done', filed: 'Filed'
                }
                return (
                  <div key={step} className="flex items-center flex-1">
                    <button
                      onClick={() => updateStatus(step)}
                      title={`Set to ${labels[step]}`}
                      className={`flex flex-col items-center gap-1 group ${idx < STATUS_STEPS.length - 1 ? 'flex-1' : ''}`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                        isComplete ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400 group-hover:bg-gray-300'
                      } ${isCurrent ? 'ring-2 ring-blue-300 ring-offset-1' : ''}`}>
                        {isComplete ? '✓' : idx + 1}
                      </div>
                      <span className={`text-[10px] hidden sm:block ${isComplete ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                        {labels[step]}
                      </span>
                    </button>
                    {idx < STATUS_STEPS.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 rounded-full ${idx < currentStepIndex ? 'bg-blue-400' : 'bg-gray-200'}`} />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-5 border-t border-gray-100 pt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Fee ₹
                <input type="number" min="0" value={fee} onChange={event => setFee(event.target.value)}
                  onBlur={() => void saveFee()} className="w-28 rounded-md border border-gray-200 px-2 py-1.5" />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={feePaid} onChange={event => {
                  setFeePaid(event.target.checked)
                  void saveClientFields({ fee_paid: event.target.checked })
                }} />
                Fee collected
              </label>
              {savingDetails && <span className="text-xs text-gray-400">Saving...</span>}
            </div>
          </div>

          <section className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">GST profile</h2>
            <form onSubmit={saveGSTDetails} className="flex flex-col sm:flex-row gap-3">
              <input value={gstin} onChange={event => setGstin(event.target.value.toUpperCase())}
                placeholder="GSTIN" maxLength={15} className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm" />
              <select value={gstScheme} onChange={event => setGstScheme(event.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="composition">Composition</option>
                <option value="exempt">Exempt</option>
              </select>
              <button type="submit" disabled={savingDetails}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                Save GST details
              </button>
            </form>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 mb-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Tags</h2>
              <TagEditor clientId={client.id} initialTags={client.tags ?? []}
                onUpdate={tags => setClient(current => ({ ...current, tags }))} />
            </div>
            <div className="border-t border-gray-100 pt-4">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Notes</h2>
              <NotesEditor clientId={client.id} initialNotes={client.notes} />
            </div>
          </section>

        </div>

        {/* Documents section */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Documents ({client.documents.length})
          </h2>
          {client.documents.length > 0 && (
            <span className="text-xs text-gray-500">
              {client.documents.filter(d => d.extraction_status === 'completed').length} extracted
            </span>
          )}
        </div>

        {client.documents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
            <p className="text-gray-500 mb-3">No documents uploaded yet.</p>
            {uploadUrl && (
              <button onClick={() => setShowLinkModal(true)}
                className="text-sm text-green-600 font-medium hover:underline">
                Share the upload link with {client.name.split(' ')[0]}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {client.documents
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map(doc => {
                const isExpanded = expandedDoc === doc.id
                const isCompleted = doc.extraction_status === 'completed'

                return (
                  <div key={doc.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {/* Doc header */}
                    <div
                      className={`flex items-center justify-between px-5 py-4 ${isCompleted ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={() => isCompleted && setExpandedDoc(isExpanded ? null : doc.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${
                          isCompleted ? 'bg-green-50' : doc.extraction_status === 'failed' ? 'bg-red-50' : 'bg-gray-100'
                        }`}>
                          📄
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                            </span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              isCompleted ? 'bg-green-50 text-green-700'
                              : doc.extraction_status === 'failed' ? 'bg-red-50 text-red-600'
                              : doc.extraction_status === 'processing' ? 'bg-purple-50 text-purple-700'
                              : 'bg-gray-100 text-gray-500'
                            }`}>
                              {isCompleted ? '✓ Extracted' : doc.extraction_status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {doc.original_filename ?? 'Unnamed file'}
                            {doc.file_size_bytes && ` · ${(doc.file_size_bytes / 1024).toFixed(0)} KB`}
                            {' · '}{new Date(doc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      {isCompleted && (
                        <span className="text-gray-400 text-lg">{isExpanded ? '▲' : '▼'}</span>
                      )}
                      {doc.extraction_status === 'failed' && (
                        <span className="text-xs text-red-500 max-w-xs truncate">{doc.extraction_error}</span>
                      )}
                    </div>

                    {/* Expanded extraction result */}
                    {isExpanded && isCompleted && doc.extracted_data && (
                      <div className="border-t border-gray-100 px-5 py-5">
                        <ExtractionResult
                          data={doc.extracted_data as Record<string, unknown>}
                          filename={doc.original_filename ?? 'document'}
                          onReset={() => setExpandedDoc(null)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </main>

      {uploadUrl && (
        <UploadLinkModal
          open={showLinkModal}
          clientName={client.name}
          uploadUrl={uploadUrl}
          phone={client.phone ?? undefined}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  )
}