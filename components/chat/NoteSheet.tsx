'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Heart, Send, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import Avatar from './Avatar'

export default function NoteSheet({
  userId,
  meId,
  onClose,
}: {
  userId: Id<'users'>
  meId: Id<'users'>
  onClose: () => void
}) {
  const note = useQuery(api.notes.getOne, { userId })
  const toggleLike = useMutation(api.notes.toggleLike)
  const toggleReplyLike = useMutation(api.notes.toggleReplyLike)
  const reply = useMutation(api.notes.reply)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showLikers, setShowLikers] = useState(false)

  async function send() {
    if (text.trim().length === 0) return
    setSending(true)
    try {
      await reply({ ownerId: userId, content: text })
      setText('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">Note</p>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        {note === undefined && <p className="text-sm text-neutral-400">Chargement…</p>}
        {note === null && <p className="text-sm text-neutral-400">Cette note a disparu.</p>}
        {note && (
          <>
            <div className="flex items-start gap-3">
              <Avatar name={note.user.name} imageUrl={note.user.imageUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{note.user.name}</p>
                <p className="mt-1 rounded-2xl rounded-tl-md bg-neutral-100 px-4 py-3 text-sm leading-relaxed">
                  {note.note}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleLike({ ownerId: userId })}
                className={`rounded-full p-2 ${note.likedByMe ? 'text-red-500' : 'text-neutral-400'}`}
                aria-label="Liker"
              >
                <Heart className={`h-5 w-5 ${note.likedByMe ? 'fill-current' : ''}`} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowLikers((open) => !open)}
              className="mt-2 text-xs font-medium text-neutral-500"
            >
              {note.likeCount} J’aime
            </button>
            {showLikers && note.likers.length > 0 && (
              <div className="mt-2 max-h-28 space-y-1.5 overflow-y-auto">
                {note.likers.map((liker) => (
                  <div key={liker._id} className="flex items-center gap-2">
                    <Avatar name={liker.name} imageUrl={liker.imageUrl} size="sm" />
                    <p className="truncate text-xs font-medium">{liker.name}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              {note.replies.map((item) => (
                <div key={item._id} className="flex gap-2">
                  <Avatar name={item.author.name} imageUrl={item.author.imageUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{item.author.name}</p>
                    <p className="text-sm text-neutral-700">{item.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleReplyLike({ replyId: item._id })}
                    className={`flex shrink-0 flex-col items-center ${
                      item.likedByMe ? 'text-red-500' : 'text-neutral-400'
                    }`}
                    aria-label="Liker le commentaire"
                  >
                    <Heart className={`h-3.5 w-3.5 ${item.likedByMe ? 'fill-current' : ''}`} />
                    {item.likeCount > 0 && (
                      <span className="text-[10px]">{item.likeCount}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={userId === meId ? 'Ajouter un commentaire…' : 'Répondre à la note…'}
                className="flex-1 rounded-full bg-neutral-100 px-3 py-2 text-sm outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void send()
                }}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || text.trim().length === 0}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
                aria-label="Envoyer"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
