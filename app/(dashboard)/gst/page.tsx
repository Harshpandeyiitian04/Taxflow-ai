import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentFirm } from '@/lib/supabase/queries'
import { getGSTDeadlines, normalizeWhatsAppPhone } from '@/lib/gst'
import Link from 'next/link'

export default async function GSTCalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getCurrentFirm()
  if (!firm) redirect('/login')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, gstin, gst_scheme, phone')
    .eq('ca_firm_id', firm.id)
    .not('gstin', 'is', null)

  const gstClients = clients ?? []
  const deadlines = getGSTDeadlines(gstClients)

  const overdue = deadlines.filter(d => d.daysLeft < 0)
  const urgent = deadlines.filter(d => d.daysLeft >= 0 && d.daysLeft <= 3)
  const upcoming = deadlines.filter(d => d.daysLeft > 3 && d.daysLeft <= 10)
  const future = deadlines.filter(d => d.daysLeft > 10)

  const clientsWithoutGST = (await supabase
    .from('clients')
    .select('id, name')
    .eq('ca_firm_id', firm.id)
    .is('gstin', null)).data ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">GST Compliance Calendar</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <div className="text-3xl font-bold text-red-600">{overdue.length + urgent.length}</div>
            <div className="text-sm text-red-500 mt-1">Overdue or due in 3 days</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="text-3xl font-bold text-amber-600">{upcoming.length}</div>
            <div className="text-sm text-amber-500 mt-1">Due in 4–10 days</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-3xl font-bold text-gray-900">{future.length}</div>
            <div className="text-sm text-gray-500 mt-1">Due in 11–30 days</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-3xl font-bold text-gray-900">{gstClients.length}</div>
            <div className="text-sm text-gray-500 mt-1">GST clients tracked</div>
          </div>
        </div>

        {deadlines.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="font-semibold text-gray-900 mb-2">No GST deadlines in the current window</p>
            <p className="text-sm text-gray-500">
              Showing returns due within 30 days (and up to 15 days overdue). Add GSTIN and scheme on client profiles to track filings.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {[
              { label: 'Overdue (last 15 days)', items: overdue, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
              { label: 'Urgent — due in 3 days', items: urgent, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
              { label: 'Upcoming — due in 4–10 days', items: upcoming, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
              { label: 'Later this month', items: future, bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-600' },
            ].filter(s => s.items.length > 0).map(section => (
              <div key={section.label}>
                <h2 className="text-sm font-semibold text-gray-500 mb-2">{section.label}</h2>
                <div className="space-y-2">
                  {section.items.map((d, i) => {
                    const dueLabel = d.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    const waMsg = encodeURIComponent(
                      `Hello, this is a reminder that your ${d.type} return is due on ${dueLabel}. Please share your sales data at your earliest convenience. Thank you.`
                    )
                    const waPhone = normalizeWhatsAppPhone(d.phone)
                    const waHref = waPhone
                      ? `https://wa.me/${waPhone}?text=${waMsg}`
                      : `https://wa.me/?text=${waMsg}`
                    return (
                      <div key={`${d.clientId}-${d.type}-${i}`} className={`${section.bg} border ${section.border} rounded-xl px-5 py-3.5 flex items-center justify-between gap-4`}>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{d.clientName}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              d.type === 'GSTR-1' ? 'bg-blue-100 text-blue-700'
                                : d.type === 'CMP-08' ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}>{d.type}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            GSTIN: {d.gstin} · Due {dueLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-sm font-semibold ${section.text}`}>
                            {d.daysLeft < 0
                              ? `${Math.abs(d.daysLeft)}d overdue`
                              : d.daysLeft === 0
                                ? 'Due today'
                                : `${d.daysLeft}d left`}
                          </span>
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                          >
                            Send reminder
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {clientsWithoutGST.length > 0 && (
          <div className="mt-8 bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="font-semibold text-gray-900 mb-1">
              {clientsWithoutGST.length} clients without GSTIN
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Add GSTIN numbers to track their GST filing deadlines automatically.
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {clientsWithoutGST.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700">{c.name}</span>
                  <Link href={`/dashboard/clients/${c.id}`}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    Add GSTIN →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
