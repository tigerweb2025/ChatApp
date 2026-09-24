'use client'

import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { Camera, LogOut, Shield, Trash2, UserMinus, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { isOnline } from '@/lib/format'
import Avatar from './Avatar'
import GroupAvatar from './GroupAvatar'

type Member = {
  _id: Id<'users'>
  name: string
  username?: string
  imageUrl?: string
  lastSeenAt?: number
}

export default function GroupPanel({
  conversationId,
  title,
  description,
  imageUrl,
  createdAt,
  members,
  memberRoles,
  myRole,
  meId,
  writePolicy,
  onClose,
  onOpenUser,
}: {
  conversationId: Id<'conversations'>
  title: string
  description?: string
  imageUrl: string | null
  createdAt: number
  members: Member[]
  memberRoles: { userId: Id<'users'>; role: 'admin' | 'member' }[]
  myRole: 'admin' | 'member' | null
  meId: Id<'users'>
  writePolicy: 'all' | 'admins'
  onClose: () => void
  onOpenUser: (userId: Id<'users'>) => void
}) {
  const updateGroup = useMutation(api.conversations.updateGroup)
  const setGroupAvatar = useMutation(api.conversations.setGroupAvatar)
  const setWritePolicy = useMutation(api.conversations.setWritePolicy)
  const promoteAdmin = useMutation(api.conversations.promoteAdmin)
  const removeMember = useMutation(api.conversations.removeMember)
  const leaveGroup = useMutation(api.conversations.leaveGroup)
  const deleteGroup = useMutation(api.conversations.deleteGroup)
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(title)
  const [desc, setDesc] = useState(description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = myRole === 'admin'
  const roleOf = (id: Id<'users'>) =>
    memberRoles.find((row) => row.userId === id)?.role ?? 'member'

  async function save() {
    try {
      await updateGroup({ conversationId, title: name, description: desc })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer')
    }
  }

  async function upload(file: File) {
    const uploadUrl = await generateUploadUrl()
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!response.ok) throw new Error('Upload impossible')
    const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
    await setGroupAvatar({ conversationId, storageId })
  }

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <p className="text-sm font-semibold">Groupe</p>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center px-6 pb-4">
          <div className="relative">
            <GroupAvatar name={title} imageUrl={imageUrl} size="lg" />
            {isAdmin && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void upload(file)
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white"
                  aria-label="Photo du groupe"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {editing ? (
            <div className="mt-4 w-full">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
              />
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                placeholder="Description"
                className="mt-2 w-full resize-none rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 rounded-xl bg-neutral-100 py-2 text-sm">
                  Annuler
                </button>
                <button onClick={() => void save()} className="flex-1 rounded-xl bg-brand py-2 text-sm text-white">
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mt-4 text-center text-lg font-semibold">{title}</h2>
              {description && (
                <p className="mt-1 text-center text-sm text-neutral-500">{description}</p>
              )}
              <p className="mt-1 text-xs text-neutral-400">
                Créé le {new Date(createdAt).toLocaleDateString('fr-FR')} · {members.length} membres
              </p>
              {isAdmin && (
                <button
                  onClick={() => setEditing(true)}
                  className="mt-2 text-xs font-medium text-brand"
                >
                  Modifier
                </button>
              )}
            </>
          )}
        </div>

        {isAdmin && (
          <div className="px-5 pb-3">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-neutral-400 uppercase">
              Qui peut écrire
            </p>
            <div className="flex rounded-xl bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => void setWritePolicy({ conversationId, writePolicy: 'all' })}
                className={`flex-1 rounded-lg py-1.5 text-xs ${writePolicy === 'all' ? 'bg-white font-medium text-brand shadow-sm' : 'text-neutral-500'}`}
              >
                Tous
              </button>
              <button
                type="button"
                onClick={() => void setWritePolicy({ conversationId, writePolicy: 'admins' })}
                className={`flex-1 rounded-lg py-1.5 text-xs ${writePolicy === 'admins' ? 'bg-white font-medium text-brand shadow-sm' : 'text-neutral-500'}`}
              >
                Admins seulement
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2">
          {members.map((member) => {
            const role = roleOf(member._id)
            return (
              <div key={member._id} className="flex items-center gap-1 px-2 py-1.5">
                <button
                  onClick={() => onOpenUser(member._id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-neutral-50"
                >
                  <Avatar
                    name={member.name}
                    imageUrl={member.imageUrl}
                    lastSeenAt={member.lastSeenAt}
                    showStatus
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {member.name}
                      {role === 'admin' && (
                        <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white uppercase">
                          Admin
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-neutral-400">
                      {isOnline(member.lastSeenAt)
                        ? 'En ligne'
                        : `@${member.username ?? 'user'}`}
                    </p>
                  </div>
                </button>
                {isAdmin && member._id !== meId && (
                  <>
                    {role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => void promoteAdmin({ conversationId, userId: member._id })}
                        className="rounded-lg p-1 text-neutral-400 hover:bg-brand-soft hover:text-brand"
                        title="Nommer admin"
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void removeMember({ conversationId, userId: member._id }).catch((err) =>
                          setError(err instanceof Error ? err.message : 'Impossible'),
                        )
                      }
                      className="rounded-lg p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      title="Retirer du groupe"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="px-5 pb-2 text-xs text-red-500">{error}</p>}

        <div className="space-y-1 border-t border-neutral-100 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              void leaveGroup({ conversationId })
                .then(onClose)
                .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de quitter'))
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <LogOut className="h-4 w-4" />
            Quitter le groupe
          </button>
          {isAdmin && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer le groupe
            </button>
          )}
          {isAdmin && confirmDelete && (
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-xs text-red-700">Supprimer ce groupe pour tout le monde ?</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-lg bg-white py-1.5 text-xs"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deleteGroup({ conversationId })
                      .then(onClose)
                      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible'))
                  }}
                  className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs text-white"
                >
                  Supprimer
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
