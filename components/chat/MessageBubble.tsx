'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, Forward, ImageIcon, Mic, MoreHorizontal, Pencil, Reply, Trash2, Undo2 } from 'lucide-react'
import type { Id } from '@/convex/_generated/dataModel'
import { formatDuration, formatMessageTime } from '@/lib/format'
import { downloadUrl } from '@/lib/download'
import { clampMenu } from '@/lib/menuPosition'
import { QUICK_REACTIONS } from '@/lib/emojis'
import EmojiPicker from './EmojiPicker'
import VoicePlayer from './VoicePlayer'

type Message = {
  _id: Id<'messages'>
  senderId: Id<'users'>
  content: string
  createdAt: number
  imageUrl: string | null
  audioUrl: string | null
  audioDurationMs?: number
  waveform?: number[]
  editedAt?: number
  forwarded: boolean
  reactions: { emoji: string; userId: Id<'users'> }[]
  kind: 'text' | 'system' | 'story_reply' | 'block_note' | 'note_reply' | 'poll'
  storyId?: Id<'stories'>
  storyImageUrl: string | null
  storyText?: string
  storyBackground?: string
  replyTo: {
    _id: Id<'messages'>
    content: string
    senderId: Id<'users'>
    hasAudio?: boolean
    hasImage?: boolean
    audioDurationMs?: number
  } | null
  noteText?: string
  pollOptions?: string[]
  pollVotes?: { userId: Id<'users'>; optionIndex: number }[]
}

export default function MessageBubble({
  message,
  mine,
  meId,
  senderName,
  showSender,
  onEdit,
  onUnsend,
  onDelete,
  onForward,
  onReact,
  onOpenStory,
  onReply,
  onVote,
  onJumpTo,
  highlighted,
  showVu,
}: {
  message: Message
  mine: boolean
  meId: Id<'users'>
  senderName?: string
  showSender?: boolean
  onEdit: (message: Message) => void
  onUnsend: (id: Id<'messages'>) => void
  onDelete: (id: Id<'messages'>) => void
  onForward: (id: Id<'messages'>) => void
  onReact: (id: Id<'messages'>, emoji: string) => void
  onOpenStory?: (storyId: Id<'stories'>) => void
  onReply?: (message: Message) => void
  onVote?: (messageId: Id<'messages'>, optionIndex: number) => void
  onJumpTo?: (id: Id<'messages'>) => void
  highlighted?: boolean
  showVu?: boolean
}) {
  const [options, setOptions] = useState<{ left: number; top: number } | null>(null)
  const [reactions, setReactions] = useState<{ left: number; top: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const longPressRef = useRef<number | null>(null)

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOptions(null)
        setReactions(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const grouped = new Map<string, { count: number; mine: boolean }>()
  for (const reaction of message.reactions) {
    const current = grouped.get(reaction.emoji) ?? { count: 0, mine: false }
    current.count += 1
    if (reaction.userId === meId) current.mine = true
    grouped.set(reaction.emoji, current)
  }

  function openOptionsAt(clientX: number, clientY: number) {
    setReactions(null)
    setOptions(clampMenu(clientX, clientY, 200, 250))
  }

  function openReactionsNear(el: HTMLElement) {
    const rect = el.getBoundingClientRect()
    setOptions(null)
    setReactions(clampMenu(rect.left, rect.bottom + 6, 320, 340))
  }

  if (message.kind === 'system') {
    return (
      <div className="flex justify-center px-6 py-2">
        <p className="max-w-[80%] rounded-full bg-white px-3 py-1 text-center text-[11px] text-neutral-500 shadow-sm">
          {message.content}
        </p>
      </div>
    )
  }

  const hasMedia = Boolean(message.imageUrl || message.audioUrl)
  const isStory = message.kind === 'story_reply'
  const isLeftover = message.kind === 'block_note'
  const showBubble =
    !isStory ||
    message.content.length > 0 ||
    message.replyTo !== null ||
    hasMedia ||
    message.kind === 'poll'

  return (
    <div
      id={`msg-${message._id}`}
      ref={rootRef}
      className={`group flex items-end gap-1 rounded-2xl px-1 py-0.5 ${
        mine ? 'justify-end' : 'justify-start'
      } ${highlighted ? 'msg-flash' : ''}`}
      onContextMenu={(event) => {
        event.preventDefault()
        openOptionsAt(event.clientX, event.clientY)
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0]
        longPressRef.current = window.setTimeout(() => {
          openOptionsAt(touch.clientX, touch.clientY)
        }, 480)
      }}
      onTouchEnd={() => {
        if (longPressRef.current !== null) window.clearTimeout(longPressRef.current)
      }}
      onTouchMove={() => {
        if (longPressRef.current !== null) window.clearTimeout(longPressRef.current)
      }}
    >
      {mine && (
        <button
          type="button"
          onClick={(event) => openReactionsNear(event.currentTarget)}
          className="mb-5 rounded-lg p-1 text-neutral-400 opacity-100 hover:bg-white hover:text-neutral-700 md:opacity-0 md:group-hover:opacity-100"
          aria-label="Réactions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}

      <div
        className={`${isStory ? 'max-w-[75%]' : 'max-w-[80%] md:max-w-[65%]'} ${
          mine ? 'items-end' : 'items-start'
        } flex flex-col`}
      >
        {showSender && senderName && (
          <p className="mb-1 px-1 text-[11px] font-medium text-neutral-400">{senderName}</p>
        )}
        {isStory && (
          <>
            <p className="mb-1 px-0.5 text-[11px] text-neutral-400">
              {mine ? 'Réponse à la story' : 'a répondu à votre story'}
            </p>
            <button
              type="button"
              onClick={() => message.storyId && onOpenStory?.(message.storyId)}
              className="overflow-hidden rounded-2xl"
            >
              {message.storyImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.storyImageUrl}
                  alt=""
                  className="h-48 w-32 object-cover"
                />
              ) : (
                <div
                  className="flex h-48 w-32 items-center justify-center px-3 text-center text-sm font-medium text-white"
                  style={{ background: message.storyBackground ?? '#3a6494' }}
                >
                  {message.storyText ?? 'Story'}
                </div>
              )}
            </button>
          </>
        )}
        {showBubble && (
          <div
            className={`rounded-2xl px-3 py-2 text-sm ${
              isStory ? 'z-10 -mt-3 max-w-[90%] shadow-sm' : ''
            } ${
              isLeftover
                ? `${mine ? 'rounded-br-md' : 'rounded-bl-md'} bg-[#c85a5a] text-white shadow-sm`
                : mine
                  ? `${isStory ? 'rounded-tr-md' : 'rounded-br-md'} bg-brand text-white`
                  : `${isStory ? 'rounded-tl-md' : 'rounded-bl-md'} bg-white text-neutral-900 ${isStory ? '' : 'shadow-sm'}`
            }`}
          >
            {message.forwarded && (
              <p className={`mb-1 text-[10px] ${mine || isLeftover ? 'text-white/80' : 'text-neutral-500'}`}>
                Transféré
              </p>
            )}
            {message.kind === 'note_reply' && (
              <div
                className={`mb-2 rounded-lg border-l-2 px-2 py-1.5 text-[11px] leading-snug ${
                  mine
                    ? 'border-white/80 bg-white/15 text-white'
                    : 'border-brand bg-brand-soft text-neutral-700'
                }`}
              >
                <p className={`mb-0.5 text-[10px] ${mine ? 'text-white/80' : 'text-brand'}`}>
                  Note
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {message.noteText || 'Note'}
                </p>
              </div>
            )}
            {message.replyTo && (
              <button
                type="button"
                onClick={() => onJumpTo?.(message.replyTo!._id)}
                className={`mb-2 w-full rounded-lg border-l-2 px-2 py-1.5 text-left text-[11px] leading-snug ${
                  mine
                    ? 'border-white/80 bg-white/15 text-white'
                    : 'border-brand bg-brand-soft text-neutral-700'
                }`}
              >
                {message.replyTo.hasAudio ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Message vocal
                      {message.replyTo.audioDurationMs
                        ? ` · ${formatDuration(message.replyTo.audioDurationMs)}`
                        : ''}
                    </span>
                  </span>
                ) : message.replyTo.hasImage && message.replyTo.content.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                    Photo
                  </span>
                ) : (
                  <span className="line-clamp-5 whitespace-pre-wrap break-words">
                    {message.replyTo.content || 'Message'}
                  </span>
                )}
              </button>
            )}
            {message.kind === 'poll' && message.pollOptions && (
              <div className="mb-2 space-y-1.5">
                <p className="font-medium">{message.content}</p>
                {message.pollOptions.map((option, index) => {
                  const votes = (message.pollVotes ?? []).filter((vote) => vote.optionIndex === index)
                  const total = message.pollVotes?.length ?? 0
                  const mineVote = (message.pollVotes ?? []).some(
                    (vote) => vote.userId === meId && vote.optionIndex === index,
                  )
                  const pct = total === 0 ? 0 : Math.round((votes.length / total) * 100)
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onVote?.(message._id, index)}
                      className={`relative w-full overflow-hidden rounded-lg px-2 py-1.5 text-left text-xs ${
                        mine ? 'bg-white/10' : 'bg-neutral-100'
                      }`}
                    >
                      <span
                        className={`absolute inset-y-0 left-0 ${mine ? 'bg-white/20' : 'bg-neutral-200'}`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative flex justify-between">
                        <span className={mineVote ? 'font-semibold' : ''}>{option}</span>
                        <span>{votes.length}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {message.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.imageUrl}
                alt=""
                className="mb-1.5 max-h-64 w-full rounded-xl object-cover"
              />
            )}
            {message.audioUrl && (
              <VoicePlayer
                src={message.audioUrl}
                durationMs={message.audioDurationMs ?? 0}
                waveform={message.waveform ?? []}
                mine={mine}
              />
            )}
            {message.content.length > 0 && message.kind !== 'poll' && (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}
            <p className={`mt-1 text-[10px] ${mine || isLeftover ? 'text-white/85' : 'text-neutral-500'}`}>
              {formatMessageTime(message.createdAt)}
              {message.editedAt !== undefined ? ' · modifié' : ''}
            </p>
          </div>
        )}
        {grouped.size > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
            {[...grouped.entries()].map(([emoji, info]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message._id, emoji)}
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  info.mine
                    ? 'bg-brand text-white'
                    : 'bg-white text-neutral-700 shadow-sm'
                }`}
              >
                {emoji} {info.count}
              </button>
            ))}
          </div>
        )}
        {showVu && (
          <p className="mt-0.5 px-1 text-[10px] text-neutral-400">Vu</p>
        )}
      </div>

      {!mine && (
        <button
          type="button"
          onClick={(event) => openReactionsNear(event.currentTarget)}
          className="mb-5 rounded-lg p-1 text-neutral-400 opacity-100 hover:bg-white hover:text-neutral-700 md:opacity-0 md:group-hover:opacity-100"
          aria-label="Réactions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}

      {options && (
        <div
          className="fixed z-50 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-xl"
          style={{ left: options.left, top: options.top }}
        >
          {onReply && message.kind !== 'poll' && message.kind !== 'block_note' && (
            <MenuItem
              icon={<Reply className="h-3.5 w-3.5" />}
              label="Répondre"
              onClick={() => {
                setOptions(null)
                onReply(message)
              }}
            />
          )}
          {mine && message.audioUrl === null && message.kind === 'text' && (
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Modifier"
              onClick={() => {
                setOptions(null)
                onEdit(message)
              }}
            />
          )}
          <MenuItem
            icon={<Forward className="h-3.5 w-3.5" />}
            label="Transférer"
            onClick={() => {
              setOptions(null)
              onForward(message._id)
            }}
          />
          {hasMedia && (
            <MenuItem
              icon={<Download className="h-3.5 w-3.5" />}
              label="Télécharger"
              onClick={() => {
                setOptions(null)
                const url = message.imageUrl ?? message.audioUrl
                if (url) {
                  void downloadUrl(
                    url,
                    message.imageUrl ? 'media.jpg' : 'vocal.webm',
                  )
                }
              }}
            />
          )}
          {mine && (
            <MenuItem
              icon={<Undo2 className="h-3.5 w-3.5" />}
              label="Retirer"
              onClick={() => {
                setOptions(null)
                onUnsend(message._id)
              }}
            />
          )}
          <MenuItem
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Supprimer"
            onClick={() => {
              setOptions(null)
              onDelete(message._id)
            }}
            danger
          />
        </div>
      )}

      {reactions && (
        <div className="fixed z-50" style={{ left: reactions.left, top: reactions.top }}>
          <div className="mb-2 flex gap-1 rounded-full bg-white p-1 shadow-lg">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(message._id, emoji)
                  setReactions(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-neutral-100"
              >
                {emoji}
              </button>
            ))}
          </div>
          <EmojiPicker
            onSelect={(emoji) => {
              onReact(message._id, emoji)
              setReactions(null)
            }}
            onClose={() => setReactions(null)}
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
        danger ? 'text-red-600' : 'text-neutral-700'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
