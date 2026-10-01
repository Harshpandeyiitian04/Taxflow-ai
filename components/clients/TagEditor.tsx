'use client'

import { useState } from 'react'

const PRESET_TAGS = [
  // Client type
  'Individual', 'HUF', 'Senior Citizen (60+)', 'Super Senior (80+)', 'NRI',
  // Income type
  'Salary Only', 'Business Income', 'Capital Gains', 'Rent Income', 'Multiple Sources',
  // Filing type
  'Old Regime', 'New Regime', 'First-time Filer',
  // Priority
  'Urgent', 'VIP', 'Complex Return', 'Waiting for Docs',
]

interface TagEditorProps {
  clientId: string
  initialTags: string[]
  onUpdate?: (tags: string[]) => void
}

export function TagEditor({ clientId, initialTags, onUpdate }: TagEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const filtered = PRESET_TAGS.filter(t =>
    !tags.includes(t) &&
    (!input || t.toLowerCase().includes(input.toLowerCase()))
  )

  async function addTag(tag: string) {
    const trimmed = tag.trim()
    if (!trimmed || tags.includes(trimmed)) return
    const newTags = [...tags, trimmed]
    await saveTags(newTags)
    setInput('')
  }

  async function removeTag(tag: string) {
    await saveTags(tags.filter(t => t !== tag))
  }

  async function saveTags(newTags: string[]) {
    setSaving(true)
    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    })
    if (res.ok) {
      setTags(newTags)
      onUpdate?.(newTags)
    }
    setSaving(false)
    setOpen(false)
  }

  const TAG_COLORS: Record<string, string> = {
    'Urgent':       'bg-red-50 text-red-700 border-red-200',
    'VIP':          'bg-purple-50 text-purple-700 border-purple-200',
    'NRI':          'bg-blue-50 text-blue-700 border-blue-200',
    'Senior Citizen (60+)': 'bg-amber-50 text-amber-700 border-amber-200',
    'First-time Filer': 'bg-green-50 text-green-700 border-green-200',
  }

  function tagClass(tag: string) {
    return TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 items-center">
        {tags.map(tag => (
          <span key={tag}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${tagClass(tag)}`}>
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:opacity-60 transition-opacity ml-0.5"
              disabled={saving}
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen(o => !o)}
          className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 px-2.5 py-1 rounded-full transition-colors"
        >
          + Add tag
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 w-72 p-2">
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag(input)}
            placeholder="Type a tag or choose below..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {input && !PRESET_TAGS.includes(input) && (
            <button
              onClick={() => addTag(input)}
              className="w-full text-left px-3 py-2 text-sm text-amber-700 bg-amber-50 rounded-lg mb-1 hover:bg-amber-100"
            >
              + Create &quot;{input}&quot;
            </button>
          )}
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filtered.map(tag => (
              <button key={tag}
                onClick={() => addTag(tag)}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                {tag}
              </button>
            ))}
          </div>
          <button onClick={() => setOpen(false)}
            className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-1">
            Close
          </button>
        </div>
      )}
    </div>
  )
}