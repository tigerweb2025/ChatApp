'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import Avatar from './Avatar'
import GroupAvatar from './GroupAvatar'

export default function ForwardModal({
  messageId,
  onClose,
}: {
  messageId: Id<'messages'>
  onClose: () => void
}) {
  const conversations = useQuery(api.conversations.listMyConversations)
  const forwardMessage = useMutation(api.messages.forwardMessage)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sendTo(conversationId: Id<'conversations'>) {
    setBusy(conversationId)
    setError(null)
    try {
      await forwardMessage({ messageId, targetConversationId: conversationId })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfert impossible')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/30 p-4 md:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-base font-semibold">Transférer vers</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-neutral-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="px-5 pt-2 text-sm text-red-500">{error}</p>}
        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-4">
          {conversations?.length === 0 && (
            <p className="px-3 py-6 text-sm text-neutral-400">Aucune autre conversation.</p>
          )}
          {conversations?.map((conversation) => {
            const title =
              conversation.kind === 'group'
                ? conversation.title ||
                  conversation.members.map((m) => m.name).join(', ')
                : conversation.otherUser?.name ?? 'Conversation'
            return (
              <button
                key={conversation._id}
                onClick={() => void sendTo(conversation._id)}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-neutral-50 disabled:opacity-50"
              >
                {conversation.kind === 'group' ? (
                  <GroupAvatar name={title} imageUrl={conversation.imageUrl} size="sm" />
                ) : (
                  <Avatar
                    name={conversation.otherUser?.name ?? 'User'}
                    imageUrl={conversation.otherUser?.imageUrl}
                    size="sm"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{title}</p>
                  <p className="truncate text-xs text-neutral-400">
                    {conversation.kind === 'group'
                      ? `${conversation.memberCount} membres`
                      : `@${conversation.otherUser?.username ?? 'user'}`}
                  </p>
                </div>
                {busy === conversation._id && (
                  <span className="text-xs text-neutral-400">Envoi…</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
