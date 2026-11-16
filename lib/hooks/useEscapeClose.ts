'use client'

import { useEffect } from 'react'

// Closes an overlay when the user presses Escape.

// Listens for Escape and calls close when the overlay is open.
export function useEscapeClose(open: boolean, onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!open || !enabled) return
    // Calls close when the user presses Escape.
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, enabled])
}