'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useClerk, useUser } from '@clerk/nextjs'
import {
  Ban,
  Camera,
  ImagePlus,
  KeyRound,
  LogOut,
  NotebookPen,
  Pencil,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { clerkErrorMessage } from '@/lib/clerkError'
import { ageLabel, isOnline } from '@/lib/format'
import Avatar from './Avatar'

type View = 'main' | 'edit' | 'password' | 'note' | 'blocked' | 'settings'

export default function ProfilePanel({
  userId,
  onClose,
  isOwner = false,
  me,
  onOpenStory,
  onComposeStory,
  onNewGroup,
  onOpenNote,
}: {
  userId: Id<'users'>
  onClose: () => void
  isOwner?: boolean
  me?: {
    name: string
    username?: string
    imageUrl?: string
    bio?: string
    birthDate?: string
    note?: string
  }
  onOpenStory?: () => void
  onComposeStory?: () => void
  onNewGroup?: () => void
  onOpenNote?: () => void
}) {
  const profile = useQuery(api.users.getProfile, { userId })
  const updateProfile = useMutation(api.users.updateProfile)
  const setAvatar = useMutation(api.users.setAvatar)
  const setNote = useMutation(api.users.setNote)
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const blockUser = useMutation(api.blocks.blockUser)
  const unblockUser = useMutation(api.blocks.unblockUser)
  const blockState = useQuery(api.blocks.status, isOwner ? 'skip' : { otherUserId: userId })
  const blockedList = useQuery(api.blocks.listBlocked, isOwner ? {} : 'skip')
  const { signOut } = useClerk()
  const { user: clerkUser } = useUser()
  const fileRef = useRef<HTMLInputElement>(null)

  const [view, setView] = useState<View>('main')
  const [name, setName] = useState(me?.name ?? '')
  const [username, setUsername] = useState(me?.username ?? '')
  const [birthDate, setBirthDate] = useState(me?.birthDate ?? '')
  const [bio, setBio] = useState(me?.bio ?? '')
  const [note, setNoteValue] = useState(me?.note ?? '')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const user = isOwner && me
    ? {
        name: me.name,
        username: me.username,
        imageUrl: me.imageUrl,
        bio: me.bio,
        note: me.note,
        age: profile?.age ?? null,
        lastSeenAt: profile?.lastSeenAt,
      }
    : profile

  async function saveProfile() {
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ name, username, birthDate, bio })
      setView('main')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer')
    } finally {
      setSaving(false)
    }
  }

  async function saveNote() {
    setSaving(true)
    setError(null)
    try {
      await setNote({ note })
      setView('main')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer')
    } finally {
      setSaving(false)
    }
  }

  async function savePassword() {
    if (password.trim().length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (clerkUser) {
        if (clerkUser.passwordEnabled) {
          await clerkUser.updatePassword({
            newPassword: password,
            currentPassword,
            signOutOfOtherSessions: false,
          })
        } else {
          await clerkUser.updatePassword({
            newPassword: password,
            signOutOfOtherSessions: false,
          })
        }
        await clerkUser.reload()
      } else {
        const response = await fetch('/api/account/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password,
            currentPassword: currentPassword || undefined,
          }),
        })
        const data = (await response.json()) as { error?: string }
        if (!response.ok) throw new Error(data.error ?? 'Impossible de définir le mot de passe')
      }
      setPassword('')
      setCurrentPassword('')
      setView('main')
    } catch (err) {
      try {
        const response = await fetch('/api/account/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password,
            currentPassword: currentPassword || undefined,
          }),
        })
        const data = (await response.json()) as { error?: string }
        if (!response.ok) {
          throw new Error(data.error ?? clerkErrorMessage(err, 'Impossible de définir le mot de passe'))
        }
        setPassword('')
        setCurrentPassword('')
        setView('main')
      } catch (fallback) {
        setError(
          clerkErrorMessage(
            fallback,
            clerkErrorMessage(
              err,
              'Impossible d’enregistrer ce mot de passe. Essaie 8 caractères min., moins courant.',
            ),
          ),
        )
      }
    } finally {
      setSaving(false)
    }
  }

  async function uploadAvatar(file: File) {
    setSaving(true)
    setError(null)
    try {
      const uploadUrl = await generateUploadUrl()
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!response.ok) throw new Error('Upload impossible')
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
      await setAvatar({ storageId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo impossible')
    } finally {
      setSaving(false)
    }
  }

  async function deleteAccount() {
    if (confirmDelete !== 'SUPPRIMER') {
      setError('Tape SUPPRIMER pour confirmer')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/account/delete', { method: 'POST' })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Suppression impossible')
      await signOut({ redirectUrl: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible')
      setSaving(false)
    }
  }

  const title =
    view === 'edit'
      ? 'Modifier le profil'
      : view === 'password'
        ? 'Mot de passe'
        : view === 'note'
          ? 'Note'
          : view === 'blocked'
            ? 'Comptes bloqués'
            : view === 'settings'
              ? 'Paramètres'
              : 'Profil'

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-4">
          {view !== 'main' ? (
            <button
              onClick={() => {
                setView('main')
                setError(null)
              }}
              className="text-sm text-neutral-500"
            >
              Retour
            </button>
          ) : (
            <p className="text-sm font-semibold">{title}</p>
          )}
          {view !== 'main' && <p className="text-sm font-semibold">{title}</p>}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {user === undefined && <p className="px-4 text-sm text-neutral-400">Chargement…</p>}
        {user === null && <p className="px-4 text-sm text-neutral-400">Profil introuvable.</p>}

        {user && view === 'main' && (
          <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8">
            <div className="flex items-start gap-4 pt-2">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenStory?.()}
                  className="rounded-full"
                >
                  <Avatar
                    name={user.name}
                    imageUrl={user.imageUrl}
                    lastSeenAt={user.lastSeenAt}
                    showStatus={!isOwner}
                    size="xl"
                  />
                </button>
                {isOwner && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadAvatar(file)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="absolute right-1 bottom-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white"
                      aria-label="Changer la photo"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1 pt-2">
                <h2 className="text-xl font-semibold tracking-tight">{user.name}</h2>
                <p className="mt-0.5 text-sm text-neutral-400">
                  @{user.username ?? 'user'}
                  {user.age ? ` · ${ageLabel(user.age)}` : ''}
                </p>
                {!isOwner && user.lastSeenAt !== undefined && (
                  <p className="mt-1 text-xs text-neutral-400">
                    {isOnline(user.lastSeenAt) ? 'En ligne' : 'Hors ligne'}
                  </p>
                )}
                {isOwner && me?.birthDate && (
                  <p className="mt-1 text-xs text-neutral-400">Né(e) le {me.birthDate}</p>
                )}
              </div>
            </div>

            {user.bio && user.bio.length > 0 && (
              <p className="mt-4 text-sm leading-relaxed text-neutral-700">{user.bio}</p>
            )}

            {user.note && (
              <button
                type="button"
                onClick={() => onOpenNote?.()}
                className="mt-4 w-full rounded-2xl bg-neutral-50 px-4 py-3 text-left"
              >
                <p className="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">
                  Note
                </p>
                <p className="mt-1 text-sm text-neutral-800">“{user.note}”</p>
              </button>
            )}

            {isOwner ? (
              <div className="mt-6 space-y-1">
                <Action
                  icon={<Users className="h-4 w-4" />}
                  label="Créer un groupe"
                  onClick={() => onNewGroup?.()}
                />
                <Action
                  icon={<Pencil className="h-4 w-4" />}
                  label="Modifier le profil"
                  onClick={() => setView('edit')}
                />
                <Action
                  icon={<ImagePlus className="h-4 w-4" />}
                  label="Ajouter une story"
                  onClick={() => onComposeStory?.()}
                />
                <Action
                  icon={<NotebookPen className="h-4 w-4" />}
                  label="Note"
                  onClick={() => setView('note')}
                />
                <Action
                  icon={<Settings className="h-4 w-4" />}
                  label="Paramètres"
                  onClick={() => setView('settings')}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (blockState?.iBlocked) void unblockUser({ userId })
                  else void blockUser({ userId })
                }}
                className={`mt-8 rounded-xl py-2.5 text-sm font-medium ${
                  blockState?.iBlocked
                    ? 'bg-neutral-100 text-neutral-800'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {blockState?.iBlocked ? 'Débloquer' : 'Bloquer'}
              </button>
            )}
          </div>
        )}

        {view === 'edit' && (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <Field label="Nom" value={name} onChange={setName} />
            <Field label="Pseudo" value={username} onChange={setUsername} />
            <label className="mt-4 block text-xs font-medium text-neutral-500">
              Date de naissance
            </label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="mt-1 w-full rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
            />
            <label className="mt-4 block text-xs font-medium text-neutral-500">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              rows={3}
              className="mt-1 w-full resize-none rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
            />
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <button
              onClick={() => void saveProfile()}
              disabled={saving}
              className="mt-5 w-full rounded-xl bg-brand py-2.5 text-sm text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
        )}

        {view === 'password' && (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <p className="text-sm text-neutral-500">
              {clerkUser?.passwordEnabled
                ? 'Change ton mot de passe. Le champ reste vide jusqu’à ce que tu en écrives un.'
                : 'Tu t’es connecté avec un provider. Le champ est vide : définis un mot de passe pour aussi te connecter par email.'}
            </p>
            {clerkUser?.passwordEnabled && (
              <>
                <label className="mt-4 block text-xs font-medium text-neutral-500">
                  Mot de passe actuel
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
                />
              </>
            )}
            <label className="mt-4 block text-xs font-medium text-neutral-500">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Laisse vide tant que tu n’as pas choisi"
              className="mt-1 w-full rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
            />
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <button
              onClick={() => void savePassword()}
              disabled={saving || password.length === 0}
              className="mt-5 w-full rounded-xl bg-brand py-2.5 text-sm text-white disabled:opacity-40"
            >
              Enregistrer le mot de passe
            </button>
          </div>
        )}

        {view === 'note' && (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <p className="text-sm text-neutral-500">
              Une note de 24h, affichée au-dessus de ta photo comme sur Instagram.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNoteValue(e.target.value)}
              maxLength={30}
              rows={2}
              placeholder="Dis quelque chose…"
              className="mt-4 w-full resize-none rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-neutral-400">{note.length}/30</p>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <button
              onClick={() => void saveNote()}
              disabled={saving}
              className="mt-4 w-full rounded-xl bg-brand py-2.5 text-sm text-white"
            >
              Publier la note
            </button>
            {me?.note && (
              <button
                onClick={() => {
                  setNoteValue('')
                  void setNote({ note: '' })
                  setView('main')
                }}
                className="mt-2 w-full rounded-xl py-2 text-sm text-red-600"
              >
                Retirer la note
              </button>
            )}
          </div>
        )}

        {view === 'blocked' && (
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {blockedList?.length === 0 && (
              <p className="px-3 text-sm text-neutral-400">Personne n’est bloqué.</p>
            )}
            {blockedList?.map((row) => (
              <div key={row.blockId} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar name={row.user.name} imageUrl={row.user.imageUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.user.name}</p>
                  <p className="truncate text-xs text-neutral-400">
                    @{row.user.username ?? 'user'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void unblockUser({ userId: row.user._id })}
                  className="rounded-lg bg-neutral-100 px-2 py-1 text-xs"
                >
                  Débloquer
                </button>
              </div>
            ))}
          </div>
        )}

        {view === 'settings' && (
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            <Action
              icon={<KeyRound className="h-4 w-4" />}
              label="Mot de passe"
              onClick={() => setView('password')}
            />
            <Action
              icon={<Ban className="h-4 w-4" />}
              label="Liste de blocage"
              onClick={() => setView('blocked')}
            />
            <Action
              icon={<LogOut className="h-4 w-4" />}
              label="Se déconnecter"
              onClick={() => void signOut({ redirectUrl: '/' })}
            />
            <div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">Supprimer le compte</p>
              <p className="mt-1 text-xs text-red-600">
                Efface tes données Convex et ton compte Clerk, définitivement.
              </p>
              <input
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                placeholder='Tape SUPPRIMER'
                className="mt-3 w-full rounded-xl bg-white px-3 py-2 text-sm outline-none"
              />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={saving}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer mon compte
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function Action({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-neutral-50"
    >
      <span className="text-neutral-500">{icon}</span>
      {label}
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <>
      <label className="mt-4 block text-xs font-medium text-neutral-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
      />
    </>
  )
}
