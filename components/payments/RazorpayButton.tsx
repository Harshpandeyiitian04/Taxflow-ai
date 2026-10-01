'use client'

import type { Plan } from '@/types'

interface Props {
  plan: Plan
  billing: 'monthly' | 'annual'
  label: string
  firmId: string
  className?: string
}

export function RazorpayButton({ label, className }: Props) {
  return (
    <button
      type="button"
      disabled
      title="Payments are disabled during free early access"
      className={className}
    >
      {label}
    </button>
  )
}