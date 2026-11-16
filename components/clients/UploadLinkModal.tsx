'use client'

// Dialog to copy or WhatsApp a client document upload link.

import { useEffect, useRef, useState } from 'react'
import { useEscapeClose } from '@/lib/hooks/useEscapeClose'
import { normalizeWhatsAppPhone } from '@/lib/gst'

interface UploadLinkModalProps {
  open: boolean
  clientName: string
  uploadUrl: string
  phone?: string | null
  onClose: () => void
}

// Shows the upload URL with copy and WhatsApp share actions.
export function UploadLinkModal({ open, clientName, uploadUrl, phone, onClose }: UploadLinkModalProps) {
  const [copied, setCopied] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEscapeClose(open, onClose)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  if (!open) return null

  // Copies the upload URL to the clipboard.
  function copyLink() {
    void navigator.clipboard.writeText(uploadUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const whatsappMsg = encodeURIComponent(
    `Hello ${clientName.split(' ')[0]} ji,\n\nPlease click this link to securely upload your Form 16 for ITR filing:\n\n${uploadUrl}\n\nJust click the link, select your PDF or a clear photo, and upload.\n\nThank you`
  )
  const internationalPhone = normalizeWhatsAppPhone(phone)
  const whatsappUrl = internationalPhone
    ? `https://wa.me/${internationalPhone}?text=${whatsappMsg}`
    : `https://wa.me/?text=${whatsappMsg}`

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-link-title"
        className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6"
      >
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3" aria-hidden>
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 id="upload-link-title" className="text-lg font-bold text-gray-900">{clientName} added</h2>
          <p className="text-sm text-gray-500 mt-1">Share this link with your client on WhatsApp</p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <p className="text-xs font-mono text-gray-700 flex-1 truncate">{uploadUrl}</p>
          <button type="button" onClick={copyLink}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
              copied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors mb-3">
          Send on WhatsApp
        </a>

        <button ref={closeRef} type="button" onClick={onClose}
          className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 rounded-lg">
          Close
        </button>
      </div>
    </div>
  )
}
