// Full-page spinner shown while a route segment is loading.
// Displays a centered spinner while route content is loading.
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-3 border-green-200 border-t-green-600 animate-spin"
          style={{ borderWidth: 3 }}
          aria-hidden
        />
        <p className="text-sm text-gray-500">Loading TaxFlow AI…</p>
      </div>
    </div>
  )
}