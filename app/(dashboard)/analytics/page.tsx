import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentFirm } from '@/lib/supabase/queries'
import Link from 'next/link'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getCurrentFirm()
  if (!firm) redirect('/login')

  const today = new Date()
  const assessmentYearStart = today.getMonth() >= 3 ? today.getFullYear() + 1 : today.getFullYear()
  const assessmentYear = `${assessmentYearStart}-${String((assessmentYearStart + 1) % 100).padStart(2, '0')}`

  // Overall stats
  const { data: stats } = await supabase
    .from('ca_analytics')
    .select('*')
    .eq('ca_firm_id', firm.id)
    .single()

  // Recent filing activity (last 14 days)
  const twoWeeksAgo = new Date(today)
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const { data: recentFiled } = await supabase
    .from('clients')
    .select('updated_at')
    .eq('ca_firm_id', firm.id)
    .eq('status', 'filed')
    .gte('updated_at', twoWeeksAgo.toISOString())
    .order('updated_at', { ascending: false })

  // Build daily filing counts for last 14 days
  const dailyCounts: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dailyCounts[d.toLocaleDateString('en-IN', { day:'numeric', month:'short' })] = 0
  }
  recentFiled?.forEach(row => {
    const key = new Date(row.updated_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })
    if (key in dailyCounts) dailyCounts[key]++
  })

  const dailyData = Object.entries(dailyCounts)
  const maxDaily = Math.max(...dailyData.map(([, v]) => v), 1)

  // Clients needing attention (pending for 7+ days)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: staleClients } = await supabase
    .from('clients')
    .select('id, name, pan, status, updated_at')
    .eq('ca_firm_id', firm.id)
    .in('status', ['pending', 'received'])
    .lte('updated_at', sevenDaysAgo.toISOString())
    .order('updated_at', { ascending: true })
    .limit(10)

  // Use the next July 31 checkpoint; actual statutory deadlines may be extended.
  const thisYearDeadline = new Date(today.getFullYear(), 6, 31)
  const itrDeadline = thisYearDeadline >= today
    ? thisYearDeadline
    : new Date(today.getFullYear() + 1, 6, 31)
  const daysLeft = Math.ceil((itrDeadline.getTime() - today.getTime()) / (1000*60*60*24))
  const dailyNeeded = daysLeft > 0 && stats
    ? Math.ceil((Number(stats.total_clients) - Number(stats.filed_count)) / daysLeft)
    : 0

  const st = stats ?? {
    total_clients: 0, filed_count: 0, done_count: 0,
    processing_count: 0, received_count: 0, pending_count: 0,
    filed_pct: 0, revenue_collected: 0, revenue_total: 0, paid_clients: 0,
  }
  const filedPct = Number(st.filed_pct) || 0

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">Practice Analytics</span>
          <span className="ml-auto text-xs text-gray-400">AY {assessmentYear}</span>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ITR Deadline banner */}
        {daysLeft > 0 && daysLeft <= 45 && (
          <div className={`rounded-2xl px-6 py-4 flex items-center justify-between ${
            daysLeft <= 7 ? 'bg-red-50 border border-red-200'
            : daysLeft <= 21 ? 'bg-amber-50 border border-amber-200'
            : 'bg-blue-50 border border-blue-200'
          }`}>
            <div>
              <p className={`font-semibold text-sm ${daysLeft<=7?'text-red-800':daysLeft<=21?'text-amber-800':'text-blue-800'}`}>
                {daysLeft <= 7 ? '🔴 ITR deadline is almost here!' : daysLeft<=21 ? '🟡 ITR deadline approaching' : '📅 ITR deadline countdown'}
              </p>
              <p className={`text-xs mt-0.5 ${daysLeft<=7?'text-red-600':daysLeft<=21?'text-amber-600':'text-blue-600'}`}>
                July 31, {itrDeadline.getFullYear()} · {daysLeft} days left · {Number(st.total_clients) - Number(st.filed_count)} clients still pending
                {dailyNeeded > 0 && ` · File ${dailyNeeded}/day to finish on time`}
              </p>
            </div>
            <div className={`text-2xl font-bold ${daysLeft<=7?'text-red-600':daysLeft<=21?'text-amber-600':'text-blue-600'}`}>
              {daysLeft}d
            </div>
          </div>
        )}

        {/* Filing progress */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Filing progress</h2>
            <span className="text-2xl font-bold text-gray-900">{filedPct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-4 mb-4 overflow-hidden">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${
                filedPct >= 80 ? 'bg-green-500' : filedPct >= 50 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${filedPct}%` }}
            />
          </div>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label:'Filed', value: Number(st.filed_count), color:'bg-green-500' },
              { label:'Done', value: Number(st.done_count), color:'bg-teal-400' },
              { label:'Processing', value: Number(st.processing_count), color:'bg-purple-400' },
              { label:'Received', value: Number(st.received_count), color:'bg-blue-400' },
              { label:'Pending', value: Number(st.pending_count), color:'bg-gray-300' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className={`w-3 h-3 rounded-full ${s.color} mx-auto mb-1`} />
                <div className="text-xl font-bold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue + activity row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Revenue */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">Revenue this season</h2>
            <div className="text-3xl font-bold text-green-600 mb-1">
              ₹{Number(st.revenue_collected).toLocaleString('en-IN')}
            </div>
            <p className="text-sm text-gray-500 mb-3">
              collected from {Number(st.paid_clients)} clients
            </p>
            {Number(st.revenue_total) > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Collected</span>
                  <span>₹{Number(st.revenue_total).toLocaleString('en-IN')} total billed</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="h-2 bg-green-500 rounded-full"
                    style={{ width: `${Math.min(100, Number(st.revenue_collected)/Number(st.revenue_total)*100)}%` }}
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Set fees on client pages to track revenue automatically
            </p>
          </div>

          {/* Daily filing chart */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">Daily filings (last 14 days)</h2>
            <div className="flex items-end gap-1 h-24">
              {dailyData.map(([day, count]) => (
                <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full bg-green-500 rounded-sm transition-all"
                    style={{ height: count ? `${Math.max(8, (count/maxDaily)*80)}px` : '4px',
                             opacity: count ? 1 : 0.15 }}
                    title={`${day}: ${count} filed`}
                  />
                  {count > 0 && (
                    <span className="text-[9px] text-gray-500">{count}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{dailyData[0][0]}</span>
              <span>Today</span>
            </div>
          </div>
        </div>

        {/* Clients needing attention */}
        {staleClients && staleClients.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-1">Clients needing attention</h2>
            <p className="text-sm text-gray-500 mb-4">
              These clients have been in the same status for 7+ days
            </p>
            <div className="space-y-2">
              {staleClients.map(c => {
                const daysStale = Math.floor((today.getTime() - new Date(c.updated_at).getTime()) / (1000*60*60*24))
                const waMsg = encodeURIComponent(
                  `Hello, this is a reminder regarding your ITR filing. Please upload your documents at your earliest convenience. Deadline is July 31, ${itrDeadline.getFullYear()}. Thank you.`
                )
                return (
                  <div key={c.id}
                    className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.pan ?? 'No PAN'} · {daysStale} days in &quot;{c.status}&quot;</p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <a href={`https://wa.me/?text=${waMsg}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1.5 rounded-lg hover:bg-green-100 font-medium">
                        WhatsApp
                      </a>
                      <Link href={`/dashboard/clients/${c.id}`}
                        className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
                        View
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}