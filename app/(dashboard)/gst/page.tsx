import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentFirm } from '@/lib/supabase/queries'
import Link from 'next/link'

interface GSTDeadline {
  clientName: string
  clientId: string
  gstin: string
  type: 'GSTR-1' | 'GSTR-3B' | 'CMP-08'
  dueDate: Date
  daysLeft: number
}

interface GSTClient {
  id: string
  name: string
  gstin: string | null
  gst_scheme?: string | null
}

function getGSTDeadlines(clients: GSTClient[]): GSTDeadline[] {
  const deadlines: GSTDeadline[] = []
  const now = new Date()

  clients.forEach(client => {
    if (!client.gstin || !client.gst_scheme || client.gst_scheme === 'exempt') return

    const addDeadline = (type: GSTDeadline['type'], dueDate: Date) => {
      const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysLeft >= 0 && daysLeft <= 30) {
        deadlines.push({ clientName: client.name, clientId: client.id, gstin: client.gstin!, type, dueDate, daysLeft })
      }
    }

    if (client.gst_scheme === 'monthly') {
      addDeadline('GSTR-1', new Date(now.getFullYear(), now.getMonth() + 1, 11, 23, 59))
      addDeadline('GSTR-3B', new Date(now.getFullYear(), now.getMonth() + 1, 20, 23, 59))
      return
    }

    const quarterDueMonth = (Math.floor(now.getMonth() / 3) + 1) * 3
    const dueYear = now.getFullYear() + Math.floor(quarterDueMonth / 12)
    const dueMonth = quarterDueMonth % 12

    if (client.gst_scheme === 'quarterly') {
      addDeadline('GSTR-1', new Date(dueYear, dueMonth, 13, 23, 59))
      addDeadline('GSTR-3B', new Date(dueYear, dueMonth, 22, 23, 59))
    } else if (client.gst_scheme === 'composition') {
      addDeadline('CMP-08', new Date(dueYear, dueMonth, 18, 23, 59))
    }
  })

  return deadlines.sort((a, b) => a.daysLeft - b.daysLeft)
}

export default async function GSTCalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getCurrentFirm()
  if (!firm) redirect('/login')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, gstin, gst_scheme')
    .eq('ca_firm_id', firm.id)
    .not('gstin', 'is', null)

  const gstClients = (clients ?? []) as GSTClient[]
  const deadlines = getGSTDeadlines(gstClients)

  const urgent   = deadlines.filter(d => d.daysLeft <= 3)
  const upcoming = deadlines.filter(d => d.daysLeft > 3 && d.daysLeft <= 10)
  const future   = deadlines.filter(d => d.daysLeft > 10)

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
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <div className="text-3xl font-bold text-red-600">{urgent.length}</div>
            <div className="text-sm text-red-500 mt-1">Due in 3 days</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="text-3xl font-bold text-amber-600">{upcoming.length}</div>
            <div className="text-sm text-amber-500 mt-1">Due in 4–10 days</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-3xl font-bold text-gray-900">{gstClients.length}</div>
            <div className="text-sm text-gray-500 mt-1">GST clients tracked</div>
          </div>
        </div>

        {/* Deadline sections */}
        {deadlines.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-4">📅</div>
            <p className="font-semibold text-gray-900 mb-2">No GST deadlines in the next 30 days</p>
            <p className="text-sm text-gray-500">Add GSTIN numbers to your clients to track their compliance deadlines.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {[
              { label: '🔴 Urgent — due in 3 days', items: urgent, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
              { label: '🟡 Upcoming — due in 4–10 days', items: upcoming, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
              { label: '🟢 This month', items: future, bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-600' },
            ].filter(s => s.items.length > 0).map(section => (
              <div key={section.label}>
                <h2 className="text-sm font-semibold text-gray-500 mb-2">{section.label}</h2>
                <div className="space-y-2">
                  {section.items.map((d, i) => {
                    const waMsg = encodeURIComponent(
                      `Hello, this is a reminder that your ${d.type} return is due on ${d.dueDate.toLocaleDateString('en-IN', { day:'numeric', month:'short' })}. Please share your sales data at your earliest convenience. Thank you.`
                    )
                    return (
                      <div key={i} className={`${section.bg} border ${section.border} rounded-xl px-5 py-3.5 flex items-center justify-between gap-4`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 text-sm">{d.clientName}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              d.type === 'GSTR-1' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>{d.type}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            GSTIN: {d.gstin} · Due {d.dueDate.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-sm font-semibold ${section.text}`}>
                            {d.daysLeft === 0 ? 'Due today' : `${d.daysLeft}d left`}
                          </span>
                          <a
                            href={`https://wa.me/?text=${waMsg}`}
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

        {/* Add GSTIN section */}
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