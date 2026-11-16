'use client'

// Top-level error UI when the root layout itself fails.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <p style={{ color: '#15803d', fontWeight: 600, margin: 0 }}>TaxFlow AI</p>
            <h1 style={{ marginTop: 12, fontSize: 24, color: '#111827' }}>Application error</h1>
            <p style={{ marginTop: 8, color: '#6b7280', fontSize: 14 }}>
              Something went wrong loading the app. Please try again.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 24,
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                padding: '10px 20px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}