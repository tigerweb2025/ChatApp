'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Avatar from './Avatar'

export default function ProfileSetup({
  me,
}: {
  me: {
    name: string
    username?: string
    imageUrl?: string
    bio?: string
    birthDate?: string
  }
}) {
  const updateProfile = useMutation(api.users.updateProfile)
  const [name, setName] = useState(me.name)
  const [username, setUsername] = useState(me.username ?? '')
  const [birthDate, setBirthDate] = useState(me.birthDate ?? '')
  const [bio, setBio] = useState(me.bio ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ name, username, birthDate, bio })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-svh items-center justify-center bg-background px-4">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm"
      >
        <p className="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">
          Dernière étape
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ton profil</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Même avec Google ou GitHub, tu personnalises ton identité avant de lancer une
          conversation.
        </p>

        <div className="mt-6 flex justify-center">
          <Avatar name={name || 'Toi'} imageUrl={me.imageUrl} size="xl" />
        </div>

        <label className="mt-6 block text-xs font-medium text-neutral-500">Nom</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={40}
          className="mt-1 w-full rounded-xl bg-neutral-100 px-3 py-2.5 text-sm outline-none"
        />

        <label className="mt-4 block text-xs font-medium text-neutral-500">Pseudo</label>
        <div className="mt-1 flex items-center rounded-xl bg-neutral-100 px-3">
          <span className="text-sm text-neutral-400">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={20}
            className="w-full bg-transparent px-1 py-2.5 text-sm outline-none"
          />
        </div>

        <label className="mt-4 block text-xs font-medium text-neutral-500">
          Date de naissance
        </label>
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          required
          className="mt-1 w-full rounded-xl bg-neutral-100 px-3 py-2.5 text-sm outline-none"
        />

        <label className="mt-4 block text-xs font-medium text-neutral-500">
          Bio <span className="font-normal text-neutral-400">(optionnel)</span>
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={160}
          rows={3}
          placeholder="Quelques mots sur toi"
          className="mt-1 w-full resize-none rounded-xl bg-neutral-100 px-3 py-2.5 text-sm outline-none"
        />
        <p className="mt-1 text-right text-[11px] text-neutral-400">{bio.length}/160</p>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Entrer dans le chat'}
        </button>
      </form>
    </div>
  )
}
