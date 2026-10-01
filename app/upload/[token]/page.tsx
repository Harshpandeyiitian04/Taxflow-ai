'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

type PageState = 'loading' | 'ready' | 'uploading' | 'success' | 'error'

interface ClientInfo {
  id: string
  name: string
  assessment_year: string | null
  ca_firm: {
    firm_name: string | null
    owner_name: string | null
    email: string
    phone?: string | null
  }
}

const DOC_TYPES = [
  { value: 'form16',          label: 'Form 16 (TDS Certificate)',   required: true },
  { value: 'bank_statement',  label: 'Bank Statement',               required: false },
  { value: 'ais',             label: 'AIS / 26AS Statement',         required: false },
  { value: 'form16a',         label: 'Form 16A TDS Certificate',      required: false },
  { value: 'capital_gains',   label: 'Capital Gains Statement',      required: false },
]

export default function UploadPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedType, setSelectedType] = useState('form16')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/upload/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErrorMsg(data.error); setState('error'); return }
        setClient(data.client)
        setUploadedDocs(data.uploadedTypes ?? [])
        setState('ready')
      })
      .catch(() => { setErrorMsg('Could not load this page. Check your link.'); setState('error') })
  }, [token])

  async function handleUpload() {
    if (!selectedFile) return
    setUploading(true)

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('type', selectedType)

    try {
      const res = await fetch(`/api/upload/${token}`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setUploadedDocs(previous => [...new Set([...previous, selectedType])])
      setSelectedFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleDone() { setState('success') }

  const firmName = client?.ca_firm?.firm_name || client?.ca_firm?.owner_name || 'Your CA'
  const caPhoneDigits = client?.ca_firm?.phone?.replace(/\D/g, '')
  const caWhatsAppPhone = caPhoneDigits
    ? caPhoneDigits.startsWith('91') ? caPhoneDigits : `91${caPhoneDigits}`
    : null
  const requiredDocumentsUploaded = DOC_TYPES.filter(document => document.required)
    .every(document => uploadedDocs.includes(document.value))

  if (state === 'loading') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading your upload page...</p>
      </div>
    </div>
  )

  if (state === 'error') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Link unavailable</h1>
        <p className="text-gray-500 text-sm">{errorMsg}</p>
      </div>
    </div>
  )

  if (state === 'success') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">All done!</h1>
        <p className="text-gray-500 mb-1">
          Your documents have been sent to <strong>{firmName}</strong>.
        </p>
        <p className="text-gray-400 text-sm">
          You will be contacted once your ITR for {client?.assessment_year ? `AY ${client.assessment_year}` : 'the selected assessment year'} is ready.
        </p>
        {uploadedDocs.length > 0 && (
          <div className="mt-6 text-left bg-green-50 rounded-xl p-4">
            <p className="text-sm font-semibold text-green-800 mb-2">Documents submitted:</p>
            {uploadedDocs.map(t => (
              <p key={t} className="text-sm text-green-700 flex items-center gap-1.5">
                <span>✓</span> {DOC_TYPES.find(d => d.value === t)?.label || t}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {firmName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{firmName}</p>
            <p className="text-xs text-gray-400">Secure document upload</p>
          </div>
        </div>
        {caWhatsAppPhone && (
          <div className="max-w-lg mx-auto mt-3 px-1">
            <a href={`https://wa.me/${caWhatsAppPhone}`}
              className="inline-flex items-center gap-2 text-sm text-green-700 hover:text-green-900">
              WhatsApp {firmName} →
            </a>
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Hello, {client?.name.split(' ')[0]}
          </h1>
          <p className="text-gray-500 text-sm">
            {firmName} needs your documents for ITR filing ({client?.assessment_year ? `AY ${client.assessment_year}` : 'assessment year to be confirmed'}).
            Upload each document below — it takes under 2 minutes.
          </p>
        </div>

        {/* Uploaded docs */}
        {uploadedDocs.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4">
            <p className="text-sm font-semibold text-green-800 mb-2">
              ✓ {uploadedDocs.length} document{uploadedDocs.length > 1 ? 's' : ''} uploaded
            </p>
            {uploadedDocs.map(t => (
              <p key={t} className="text-sm text-green-700">
                {DOC_TYPES.find(d => d.value === t)?.label || t}
              </p>
            ))}
          </div>
        )}

        {/* Upload form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Upload a document</h2>

          {/* Document type selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document type
            </label>
            <div className="space-y-2">
              {DOC_TYPES.filter(d => !uploadedDocs.includes(d.value)).map(doc => (
                <label key={doc.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${selectedType === doc.value ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <input type="radio" name="docType" value={doc.value}
                    checked={selectedType === doc.value}
                    onChange={() => setSelectedType(doc.value)}
                    className="text-green-600" />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{doc.label}</span>
                    {doc.required && (
                      <span className="ml-2 text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">Required</span>
                    )}
                  </div>
                </label>
              ))}
              {DOC_TYPES.every(d => uploadedDocs.includes(d.value)) && (
                <p className="text-sm text-green-600 font-medium">All documents uploaded!</p>
              )}
            </div>
          </div>

          {/* File picker */}
          {!DOC_TYPES.every(d => uploadedDocs.includes(d.value)) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select file
              </label>
              <div
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  selectedFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
                }`}
              >
                <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                />
                {selectedFile ? (
                  <div>
                    <p className="text-green-700 font-medium text-sm">📄 {selectedFile.name}</p>
                    <p className="text-green-600 text-xs mt-1">{(selectedFile.size/1024).toFixed(0)} KB — tap to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600 font-medium text-sm">Tap to select file</p>
                    <p className="text-gray-400 text-xs mt-1">PDF, JPEG, PNG — max 10 MB</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full mt-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                ) : (
                  'Upload document'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Done button */}
        {uploadedDocs.length > 0 && requiredDocumentsUploaded && (
          <button
            onClick={handleDone}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
          >
            I have uploaded all my documents — Done
          </button>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Your documents are encrypted and shared only with {firmName}.
        </p>
      </div>
    </div>
  )
}