'use client'

import { useState } from 'react'

interface UploadLinkModalProps {
  open: boolean
  clientName: string
  uploadUrl: string
  phone?: string | null
  onClose: () => void
}

export function UploadLinkModal({ open, clientName, uploadUrl, phone, onClose }: UploadLinkModalProps) {
  const [copied, setCopied] = useState(false)
  if (!open) return null

  function copyLink() {
    navigator.clipboard.writeText(uploadUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const whatsappMsg = encodeURIComponent(
    `Hello ${clientName.split(' ')[0]} ji,\n\nPlease click this link to securely upload your Form 16 for ITR filing:\n\n${uploadUrl}\n\nJust click the link, select your PDF or a clear photo, and upload.\n\nThank you`
  )
  const digits = phone?.replace(/\D/g, '')
  const internationalPhone = digits ? (digits.startsWith('91') ? digits : `91${digits}`) : null
  const whatsappUrl = internationalPhone
    ? `https://wa.me/${internationalPhone}?text=${whatsappMsg}`
    : `https://wa.me/?text=${whatsappMsg}`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900">{clientName} added</h2>
          <p className="text-sm text-gray-500 mt-1">Share this link with your client on WhatsApp</p>
        </div>

        {/* Link box */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <p className="text-xs font-mono text-gray-700 flex-1 truncate">{uploadUrl}</p>
          <button onClick={copyLink}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
              copied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* WhatsApp button */}
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors mb-3">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Send on WhatsApp
        </a>

        <button onClick={onClose}
          className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm transition-colors">
          Close
        </button>
      </div>
    </div>
  )
}