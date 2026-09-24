'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Check, Search, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import Avatar from './Avatar'

export default function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: Id<'conversations'>) => void
}) {
  const createGroup = useMutation(api.conversations.createGroup)
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<
    { _id: Id<'users'>; name: string; username?: string; imageUrl?: string }[]
  >([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 160)
    return () => clearTimeout(t)
  }, [query])

  const suggestions = useQuery(api.users.searchUsers, { q: debounced })

  function toggle(user: (typeof selected)[number]) {
    setSelected((current) =>
      current.some((item) => item._id === user._id)
        ? current.filter((item) => item._id !== user._id)
        : [...current, user],
    )
  }

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const id = await createGroup({
        title,
        memberIds: selected.map((user) => user._id),
      })
      onCreated(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer le groupe')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-base font-semibold">Nouveau groupe</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-neutral-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pt-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nom du groupe (optionnel)"
            maxLength={40}
            className="w-full rounded-xl bg-neutral-100 px-3 py-2.5 text-sm outline-none"
          />
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2">
            <Search className="h-4 w-4 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ajouter des membres"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 pt-3">
            {selected.map((user) => (
              <button
                key={user._id}
                onClick={() => toggle(user)}
                className="flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-xs text-white"
              >
                {user.name}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-2">
          {suggestions?.map((user) => {
            const active = selected.some((item) => item._id === user._id)
            return (
              <button
                key={user._id}
                onClick={() => toggle(user)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-neutral-50"
              >
                <Avatar name={user.name} imageUrl={user.imageUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-neutral-400">@{user.username ?? 'user'}</p>
                </div>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    active ? 'border-neutral-900 bg-brand text-white' : 'border-neutral-300'
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
              </button>
            )
          })}
        </div>
        {error && <p className="px-5 pb-2 text-sm text-red-500">{error}</p>}
        <div className="px-5 pb-5">
          <button
            onClick={() => void submit()}
            disabled={saving || selected.length < 2}
            className="w-full rounded-xl bg-brand py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? 'Création…' : 'Créer le groupe'}
          </button>
          <p className="mt-2 text-center text-[11px] text-neutral-400">
            Choisis au moins 2 personnes. L’avatar du groupe empile les 3 premiers.
          </p>
        </div>
      </div>
    </div>
  )
}
