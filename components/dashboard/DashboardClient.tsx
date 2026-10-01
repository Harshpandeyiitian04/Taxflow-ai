'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { AddClientModal } from '@/components/clients/AddClientModal'
import { UploadLinkModal } from '@/components/clients/UploadLinkModal'
import { downloadWinmanBulkCSV } from '@/lib/utils/winman-export'
import type { CAFirm, Client, ClientStatus } from '@/types'


interface ClientWithDocs extends Client {
  documents: { id: string; type: string; extraction_status: string; extracted_data?: Record<string, unknown> | null }[]
}

interface Props {
  initialClients: ClientWithDocs[]
  firm: CAFirm
}

const STATUS_CONFIG: Record<ClientStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending docs', bg: 'bg-gray-100', text: 'text-gray-600' },
  received: { label: 'Received', bg: 'bg-blue-50', text: 'text-blue-700' },
  processing: { label: 'Processing', bg: 'bg-purple-50', text: 'text-purple-700' },
  done: { label: 'Done', bg: 'bg-teal-50', text: 'text-teal-700' },
  filed: { label: 'Filed ✓', bg: 'bg-green-50', text: 'text-green-700' },
}

const STATUS_ORDER: ClientStatus[] = ['pending', 'received', 'processing', 'done', 'filed']

export function DashboardClient({ initialClients, firm }: Props) {
  const [clients, setClients] = useState<ClientWithDocs[]>(initialClients)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'board' | 'list'>('list')
  const [showAdd, setShowAdd] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [linkModal, setLinkModal] = useState<{ name: string; url: string; phone?: string } | null>(null)
  const [loadingLinkId, setLoadingLinkId] = useState<string | null>(null)
  const [schedulingClientId, setSchedulingClientId] = useState<string | null>(null)
  const [scheduledReminderCount, setScheduledReminderCount] = useState<Record<string, number>>({})

  // Stats
  const stats = useMemo(() => ({
    total: clients.length,
    pending: clients.filter(c => c.status === 'pending').length,
    inProgress: clients.filter(c => c.status === 'received' || c.status === 'processing').length,
    filed: clients.filter(c => c.status === 'filed').length,
  }), [clients])

  // Filter
  const filtered = useMemo(() => {
    return clients.filter(c => {
      const matchSearch = !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.pan ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone ?? '').includes(search)
      const matchStatus = statusFilter === 'all' || c.status === statusFilter
      const matchTags = tagFilters.length === 0 || tagFilters.every(tag => (c.tags ?? []).includes(tag))
      return matchSearch && matchStatus && matchTags
    })
  }, [clients, search, statusFilter, tagFilters])

  const availableTags = useMemo(
    () => [...new Set(clients.flatMap(client => client.tags ?? []))].sort(),
    [clients]
  )

  function handleClientCreated(client: Client, uploadUrl: string) {
    setClients(prev => [{ ...client, documents: [] }, ...prev])
    setShowAdd(false)
    setLinkModal({ name: client.name, url: uploadUrl, phone: client.phone ?? undefined })
  }

  async function handleDelete(clientId: string) {
    if (!confirm('Delete this client and all their documents?')) return
    await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
    setClients(prev => prev.filter(c => c.id !== clientId))
  }

  async function scheduleReminders(clientId: string, sequence: string) {
    setSchedulingClientId(clientId)
    try {
      const response = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, sequence }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not schedule reminders')
      setScheduledReminderCount(current => ({ ...current, [clientId]: data.scheduled }))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not schedule reminders')
    } finally {
      setSchedulingClientId(null)
    }
  }

  async function changeClientStatus(clientId: string, status: ClientStatus) {
    const previousClients = clients
    setClients(current => current.map(client => client.id === clientId ? { ...client, status } : client))

    const response = await fetch(`/api/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      setClients(previousClients)
      alert('Could not update client status. Please try again.')
    }
  }

  function toggleClientSelection(clientId: string) {
    setSelectedClientIds(current => current.includes(clientId)
      ? current.filter(id => id !== clientId)
      : [...current, clientId])
  }

  function toggleVisibleSelection() {
    const visibleIds = filtered.map(client => client.id)
    const allSelected = visibleIds.every(id => selectedClientIds.includes(id))
    setSelectedClientIds(current => allSelected
      ? current.filter(id => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])])
  }

  async function updateSelectedStatus(status: ClientStatus) {
    const updates = await Promise.all(selectedClientIds.map(clientId =>
      fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    ))

    if (updates.some(response => !response.ok)) {
      alert('Some client statuses could not be updated. Please refresh and try again.')
      return
    }

    setClients(current => current.map(client => selectedClientIds.includes(client.id)
      ? { ...client, status }
      : client))
    setSelectedClientIds([])
  }

  function exportSelectedClients() {
    const rows = clients.flatMap(client => {
      if (!selectedClientIds.includes(client.id)) return []
      const doc = client.documents.find(document => document.type === 'form16' && document.extraction_status === 'completed')
      if (!doc?.extracted_data) return []
      return [{ name: client.name, pan: client.pan, data: doc.extracted_data }]
    })

    if (!rows.length) {
      alert('Selected clients have no completed Form 16 extractions to export.')
      return
    }
    downloadWinmanBulkCSV(rows)
  }

  const firmName = firm.firm_name || firm.owner_name || 'Your firm'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-900">TaxFlow AI</span>
            <span className="text-gray-300 text-sm">/</span>
            <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              {firmName === 'Your firm' ? '+ Add firm name' : firmName}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/extract"
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden xl:block">
              Extract Form 16
            </Link>
            <Link href="/bulk" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden xl:block">
              Bulk extract
            </Link>
            <Link href="/gst" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden xl:block">
              GST calendar
            </Link>
            <Link href="/analytics" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden xl:block">
              Analytics
            </Link>
            <Link href="/referral" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden xl:block">
              Referrals
            </Link>
            <Link href="/profile"
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden xl:block">
              Profile
            </Link>
            <button type="button" onClick={() => setMobileMenuOpen(open => !open)}
              aria-expanded={mobileMenuOpen} aria-label="Toggle navigation menu"
              className="text-sm text-gray-700 border border-gray-200 px-3 py-2 rounded-lg xl:hidden">
              Menu
            </button>
            <form action="/auth/signout" method="POST">
              <button type="submit"
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      {mobileMenuOpen && (
        <div className="xl:hidden border-b border-gray-200 bg-white px-4 py-3 grid grid-cols-2 gap-2">
          {[
            ['/extract', 'Form 16 extractor'],
            ['/bulk', 'Bulk extraction'],
            ['/gst', 'GST calendar'],
            ['/analytics', 'Analytics'],
            ['/referral', 'Referrals'],
            ['/profile', 'Profile'],
          ].map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {label}
            </Link>
          ))}
        </div>
      )}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total clients', value: stats.total, onClick: () => setStatusFilter('all') },
            { label: 'Pending docs', value: stats.pending, onClick: () => setStatusFilter('pending') },
            { label: 'In progress', value: stats.inProgress, onClick: () => setStatusFilter('received') },
            { label: 'Filed', value: stats.filed, onClick: () => setStatusFilter('filed') },
          ].map(s => (
            <button key={s.label} onClick={s.onClick}
              className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 transition-colors">
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, PAN, or phone..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ClientStatus | 'all')}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All statuses</option>
            <option value="pending">Pending docs</option>
            <option value="received">Received</option>
            <option value="processing">Processing</option>
            <option value="done">Done</option>
            <option value="filed">Filed</option>
          </select>
            {availableTags.length > 0 && (
              <select multiple value={tagFilters} onChange={event => setTagFilters(Array.from(event.target.selectedOptions, option => option.value))}
                aria-label="Filter by client tags"
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            )}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1" role="group" aria-label="Client view">
            {(['board', 'list'] as const).map(mode => (
              <button key={mode} type="button" aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${viewMode === mode ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {mode}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 shrink-0">
            <span>+</span> Add client
          </button>
        </div>

        {/* Client status board and list */}
        {viewMode === 'board' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-start">
            {STATUS_ORDER.map(status => {
              const config = STATUS_CONFIG[status]
              const columnClients = filtered.filter(client => client.status === status)

              return (
                <section key={status} className="min-w-0 rounded-lg border border-gray-200 bg-gray-100/70">
                  <header className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
                    <h2 className="text-sm font-semibold text-gray-800">{config.label}</h2>
                    <span className="text-xs font-medium text-gray-500">{columnClients.length}</span>
                  </header>
                  <div className="space-y-2 p-2">
                    {columnClients.map(client => (
                      <article key={client.id} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                        <Link href={`/dashboard/clients/${client.id}`} className="block min-w-0 hover:text-green-700">
                          <p className="truncate text-sm font-semibold text-gray-900">{client.name}</p>
                          <p className="mt-1 truncate text-xs text-gray-500">{client.pan ?? 'PAN not added'} · {client.assessment_year ? `AY ${client.assessment_year}` : 'AY not set'}</p>
                        </Link>
                        <p className="mt-2 text-xs text-gray-500">
                          {client.documents?.filter(document => document.extraction_status === 'completed').length ?? 0}
                          /{client.documents?.length ?? 0} documents extracted
                        </p>
                        <select aria-label={`Status for ${client.name}`} value={client.status}
                          onChange={event => void changeClientStatus(client.id, event.target.value as ClientStatus)}
                          className="mt-3 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700">
                          {STATUS_ORDER.map(option => (
                            <option key={option} value={option}>{STATUS_CONFIG[option].label}</option>
                          ))}
                        </select>
                      </article>
                    ))}
                    {columnClients.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-gray-400">No clients</p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16 px-4">
              {clients.length === 0 ? (
                <>
                  <div className="text-5xl mb-4">👥</div>
                  <p className="font-semibold text-gray-900 mb-1">No clients yet</p>
                  <p className="text-sm text-gray-500 mb-5">Add your first client to get started. Takes 30 seconds.</p>
                  <button onClick={() => setShowAdd(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
                    Add your first client
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-500">No clients match your search.</p>
                  <button onClick={() => { setSearch(''); setStatusFilter('all'); setTagFilters([]) }}
                    className="text-sm text-blue-600 mt-2 hover:underline">Clear filters</button>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* Table header — desktop only */}
              <div className="hidden sm:grid grid-cols-[28px_1fr_120px_100px_auto] gap-4 px-5 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <input type="checkbox" aria-label="Select all visible clients"
                  checked={filtered.length > 0 && filtered.every(client => selectedClientIds.includes(client.id))}
                  onChange={toggleVisibleSelection} />
                <span>Client</span>
                <span>AY</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {filtered.map(client => {
                const cfg = STATUS_CONFIG[client.status] ?? STATUS_CONFIG.pending
                const docCount = client.documents?.length ?? 0
                const completedDocs = client.documents?.filter(d => d.extraction_status === 'completed').length ?? 0

                return (
                  <div key={client.id}
                    className="grid grid-cols-[28px_1fr] sm:grid-cols-[28px_1fr_120px_100px_auto] gap-2 sm:gap-4 px-5 py-4 hover:bg-gray-50 transition-colors items-center">
                    <input type="checkbox" aria-label={`Select ${client.name}`}
                      checked={selectedClientIds.includes(client.id)}
                      onChange={() => toggleClientSelection(client.id)} />
                    {/* Client info */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-linear-to-br from-blue-100 to-blue-200 flex items-center justify-center text-sm font-semibold text-blue-700 shrink-0">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{client.name}</p>
                        <p className="text-xs text-gray-400">
                          {client.pan ?? 'PAN not added'}
                          {client.phone && <span className="ml-2">· {client.phone}</span>}
                          {docCount > 0 && (
                            <span className="ml-2 text-blue-500">· {completedDocs}/{docCount} extracted</span>
                          )}
                        </p>
                        {client.tags?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {client.tags.map(tag => <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{tag}</span>)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AY */}
                    <span className="text-sm text-gray-500 hidden sm:block">{client.assessment_year ? `AY ${client.assessment_year}` : 'AY not set'}</span>

                    {/* Status */}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full w-fit ${cfg.bg} ${cfg.text}`}>
                      {cfg.label}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {client.status === 'pending' && (
                        <button onClick={() => void scheduleReminders(client.id, 'document_request')}
                          disabled={schedulingClientId === client.id || Boolean(scheduledReminderCount[client.id])}
                          className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                          {scheduledReminderCount[client.id]
                            ? `${scheduledReminderCount[client.id]} reminders scheduled`
                            : schedulingClientId === client.id ? 'Scheduling...' : 'Schedule reminders'}
                        </button>
                      )}
                      {client.gstin && (
                        <>
                          <button onClick={() => void scheduleReminders(client.id, 'gst_gstr1')}
                            disabled={schedulingClientId === client.id}
                            className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                            GSTR-1
                          </button>
                          <button onClick={() => void scheduleReminders(client.id, 'gst_gstr3b')}
                            disabled={schedulingClientId === client.id}
                            className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                            GSTR-3B
                          </button>
                        </>
                      )}
                      <Link href={`/dashboard/clients/${client.id}`}
                        className="text-xs text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-colors">
                        View
                      </Link>
                      <button
                        disabled={loadingLinkId === client.id}
                        onClick={async () => {
                          setLoadingLinkId(client.id)
                          try {
                            const res = await fetch(`/api/clients/${client.id}`)
                            const data = await res.json()
                            if (data.uploadUrl) {
setLinkModal({ name: client.name, url: data.uploadUrl, phone: client.phone ?? undefined })
                            } else {
                              alert('Could not generate upload link. Please try again.')
                            }
                          } catch {
                            alert('Network error. Please try again.')
                          } finally {
                            setLoadingLinkId(null)
                          }
                        }}
                        className="text-xs text-green-600 hover:text-green-800 px-2.5 py-1.5 rounded-lg border border-green-200 hover:border-green-300 bg-green-50 transition-colors disabled:opacity-50">
                        {loadingLinkId === client.id ? '...' : 'Share link'}
                      </button>
                      <button onClick={() => handleDelete(client.id)}
                        className="text-xs text-gray-400 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}

        {selectedClientIds.length > 0 && (
          <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 shadow-lg">
            <span className="text-sm font-medium text-gray-800">{selectedClientIds.length} selected</span>
            <button type="button" onClick={() => void updateSelectedStatus('filed')}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white">
              Mark filed
            </button>
            <button type="button" onClick={exportSelectedClients}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700">
              Export Winman CSV
            </button>
            <button type="button" onClick={() => setSelectedClientIds([])}
              className="text-sm text-gray-500 hover:text-gray-800">
              Clear
            </button>
          </div>
        )}

        {/* Footer count */}
        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 mt-3 text-right">
            Showing {filtered.length} of {clients.length} clients
          </p>
        )}
      </main>

      {/* Modals */}
      <AddClientModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={handleClientCreated}
      />
      {linkModal && (
        <UploadLinkModal
          open={true}
          clientName={linkModal.name}
          uploadUrl={linkModal.url}
          phone={linkModal.phone}
          onClose={() => setLinkModal(null)}
        />
      )}
    </div>
  )
}