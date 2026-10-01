'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Client } from '@/types'
import { AddClientModal } from '@/components/clients/AddClientModal'
import { UploadLinkModal } from '@/components/clients/UploadLinkModal'

interface UploadModalState {
  open: boolean
  clientName: string
  phone: string | null
  uploadUrl: string
}

const INITIAL_UPLOAD_MODAL_STATE: UploadModalState = {
  open: false,
  clientName: '',
  phone: null,
  uploadUrl: '',
}

export function AddClientButton() {
  const router = useRouter()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [uploadModal, setUploadModal] = useState<UploadModalState>(
    INITIAL_UPLOAD_MODAL_STATE
  )

  function handleCreated(client: Client, uploadUrl: string) {
    setIsAddOpen(false)
    setUploadModal({
      open: true,
      clientName: client.name,
      phone: client.phone,
      uploadUrl,
    })
    router.refresh()
  }

  function closeUploadModal() {
    setUploadModal(INITIAL_UPLOAD_MODAL_STATE)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsAddOpen(true)}
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        + Add client
      </button>

      <AddClientModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={handleCreated}
      />

      <UploadLinkModal
        open={uploadModal.open}
        clientName={uploadModal.clientName}
        uploadUrl={uploadModal.uploadUrl}
        phone={uploadModal.phone}
        onClose={closeUploadModal}
      />
    </>
  )
}
