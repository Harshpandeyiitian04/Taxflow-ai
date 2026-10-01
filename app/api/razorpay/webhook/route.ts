import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Payments are disabled. TaxFlow AI is free during early access.' },
    { status: 410 }
  )
}