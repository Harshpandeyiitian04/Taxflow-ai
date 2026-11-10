'use client'

import { useId, useRef, useState } from 'react'
import { MAX_UPLOAD_MB } from '@/lib/constants'

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  isLoading: boolean
  accept?: string
}

export function UploadZone({
  onFileSelect,
  isLoading,
  accept = '.pdf,.jpg,.jpeg,.png,.webp',
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

  function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Only PDF, JPEG, PNG, and WebP files are supported.'
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return `File must be under ${MAX_UPLOAD_MB} MB. Compress or split the PDF. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`
    }
    return null
  }

  function handleFile(file: File) {
    const err = validateFile(file)
    if (err) { setError(err); return }
    setError(null)
    onFileSelect(file)
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (isLoading) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    if (!isLoading) setIsDragging(true)
  }

  function onDragLeave() { setIsDragging(false) }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          block border-2 border-dashed rounded-2xl p-10 text-center transition-all
          focus-within:ring-2 focus-within:ring-green-500 focus-within:ring-offset-2
          ${isLoading
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
            : isDragging
              ? 'border-green-400 bg-green-50 cursor-copy scale-[1.01]'
              : 'border-gray-300 bg-white hover:border-green-400 hover:bg-green-50 cursor-pointer'
          }
        `}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onInputChange}
          className="sr-only"
          disabled={isLoading}
          aria-label={`Upload document, max ${MAX_UPLOAD_MB} MB`}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-3 border-green-200 border-t-green-600 rounded-full animate-spin" style={{ borderWidth: '3px' }} aria-hidden />
            <p className="text-gray-600 font-medium">Extracting document data...</p>
            <p className="text-gray-400 text-sm">Gemini Vision is reading your file</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-colors ${isDragging ? 'bg-green-100' : 'bg-gray-100'}`} aria-hidden>
              📄
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">
                {isDragging ? 'Drop your document here' : 'Upload your document'}
              </p>
              <p className="text-sm text-gray-500">
                Drag & drop or press Enter to browse · PDF, JPEG, PNG, WebP · Max {MAX_UPLOAD_MB} MB
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {['PDF document', 'Scanned document', 'Document photo'].map(t => (
                <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </label>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2" role="alert">
          <span className="text-red-500 mt-0.5 shrink-0" aria-hidden>!</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  )
}
