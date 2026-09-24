'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Ban, MessageCircle, MoreHorizontal, Search, Trash2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { formatListTime, isOnline, previewText } from '@/lib/format'
import Avatar from './Avatar'
import GroupAvatar from './GroupAvatar'
import StoryBar from './StoryBar'

export default function Sidebar({
  selectedId,
  onSelect,
  me,
  onOpenMe,
  onOpenStory,
  onComposeStory,
  onOpenNote,
}: {
  selectedId: Id<'conversations'> | null
  onSelect: (id: Id<'conversations'> | null) => void
  me: { _id: Id<'users'>; name: string; imageUrl?: string; username?: string; note?: string }
  onOpenMe: () => void
  onOpenStory: (userId: Id<'users'>, storyId?: Id<'stories'>) => void
  onComposeStory: () => void
  onOpenNote: (userId: Id<'users'>) => void
}) {
  const conversations = useQuery(api.conversations.listMyConversations)
  const startConversation = useMutation(api.conversations.startConversation)
  const hideConversation = useMutation(api.conversations.hideConversation)
  const blockUser = useMutation(api.blocks.blockUser)
  const unblockUser = useMutation(api.blocks.unblockUser)
  const storyFeed = useQuery(api.stories.listFeed)
  const notesFeed = useQuery(api.notes.listFeed)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuId, setMenuId] = useState<Id<'conversations'> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (menuId === null) return
    function onDoc(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-conv-menu]')) return
      setMenuId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuId])

  const suggestions = useQuery(api.users.searchUsers, { q: debounced })
  const searching = query.trim().length > 0

  async function openWith(userId: Id<'users'>) {
    try {
      const id = await startConversation({ otherUserId: userId })
      onSelect(id)
      setQuery('')
    } catch {
      setQuery('')
    }
  }

  async function removeConversation(id: Id<'conversations'>) {
    await hideConversation({ conversationId: id })
    if (selectedId === id) onSelect(null)
    setMenuId(null)
  }

  async function toggleBlock(userId: Id<'users'>, currentlyBlocked: boolean) {
    if (currentlyBlocked) await unblockUser({ userId })
    else await blockUser({ userId })
    setMenuId(null)
  }

  return (
    <div className="relative flex h-full flex-col bg-white">
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <h1 className="flex-1 text-lg font-semibold tracking-tight">ChatApp</h1>
          <button type="button" onClick={onOpenMe} aria-label="Mon profil">
            <Avatar name={me.name} imageUrl={me.imageUrl} size="sm" />
          </button>
        </div>
        <label className="mt-4 flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2">
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setSearchOpen(false), 180)
            }}
            placeholder="Rechercher un nom ou @pseudo"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </label>
      </div>

      <StoryBar
        feed={storyFeed ?? []}
        notes={[
          ...(notesFeed ?? []),
          ...((conversations ?? []).flatMap((conversation) => {
            const rows: { user: { _id: Id<'users'>; name: string; imageUrl?: string; note?: string }; note: string }[] =
              []
            if (conversation.otherUser?.note) {
              rows.push({ user: conversation.otherUser, note: conversation.otherUser.note })
            }
            for (const member of conversation.members) {
              if (member._id === me._id || !member.note) continue
              rows.push({ user: member, note: member.note })
            }
            return rows
          })),
        ]}
        meId={me._id}
        me={{
          ...me,
          note: me.note ?? notesFeed?.find((item) => item.user._id === me._id)?.note,
        }}
        onOpen={onOpenStory}
        onCompose={onComposeStory}
        onOpenNote={onOpenNote}
      />

      <div className="mx-6 h-px bg-neutral-200/70" />

      <div className="flex-1 overflow-y-auto">
        {searching ? (
          <div className="px-2 py-2">
            <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-neutral-400 uppercase">
              Résultats
            </p>
            {suggestions === undefined && (
              <p className="px-3 py-4 text-sm text-neutral-400">Recherche…</p>
            )}
            {suggestions?.length === 0 && (
              <p className="px-3 py-4 text-sm text-neutral-400">Personne trouvé.</p>
            )}
            {suggestions?.map((user) => (
              <div
                key={user._id}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 hover:bg-neutral-50"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (user.firstStoryId) onOpenStory(user._id, user.firstStoryId)
                    else void openWith(user._id)
                  }}
                  aria-label={user.hasStories ? `Story de ${user.name}` : user.name}
                >
                  <Avatar
                    name={user.name}
                    imageUrl={user.imageUrl}
                    lastSeenAt={user.lastSeenAt}
                    showStatus={!user.hasStories}
                    size="sm"
                    ring={user.hasStories ? 'unseen' : 'none'}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void openWith(user._id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-neutral-400">
                    {user.blockedByThem
                      ? 'vous a bloqué'
                      : user.iBlocked
                        ? 'bloqué'
                        : `@${user.username ?? 'user'}`}
                  </p>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            {searchOpen && query === '' && suggestions && suggestions.length > 0 && (
              <div className="px-2 py-2">
                <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-neutral-400 uppercase">
                  Suggestions
                </p>
                {suggestions.map((user) => (
                  <div
                    key={user._id}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 hover:bg-neutral-50"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (user.firstStoryId) onOpenStory(user._id, user.firstStoryId)
                        else void openWith(user._id)
                      }}
                      aria-label={user.hasStories ? `Story de ${user.name}` : user.name}
                    >
                      <Avatar
                        name={user.name}
                        imageUrl={user.imageUrl}
                        lastSeenAt={user.lastSeenAt}
                        showStatus={!user.hasStories}
                        size="sm"
                        ring={user.hasStories ? 'unseen' : 'none'}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => void openWith(user._id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      <p className="truncate text-xs text-neutral-400">
                        {isOnline(user.lastSeenAt) ? 'En ligne' : `@${user.username ?? 'user'}`}
                      </p>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="px-4 pt-2 pb-1 text-[11px] font-medium tracking-wide text-neutral-400 uppercase">
              Messages
            </p>

            {conversations === undefined && (
              <div className="space-y-2 p-4">
                <div className="h-14 animate-pulse rounded-xl bg-neutral-100" />
                <div className="h-14 animate-pulse rounded-xl bg-neutral-100" />
              </div>
            )}

            {conversations?.length === 0 && (
              <p className="px-5 py-8 text-sm text-neutral-400">
                Aucune conversation. Cherche quelqu’un ou crée un groupe.
              </p>
            )}

            {conversations?.map((conversation) => {
              const unread = conversation.unreadCount > 0
              const selected = conversation._id === selectedId
              const last = conversation.lastMessage
              const leftover =
                conversation.blockStatus?.incomingLeftover &&
                !conversation.blockStatus.leftoverRevealed
              const activity = conversation.unseenPreview
              const preview = leftover
                ? `clique pour voir le dernier message de ${conversation.otherUser?.name ?? 'Quelqu’un'}`
                : activity?.kind === 'reaction'
                  ? `a réagi avec ${activity.emoji ?? ''}`
                  : activity?.kind === 'note_like'
                    ? 'a aimé votre note'
                    : activity?.kind === 'note_reply'
                      ? 'a répondu à votre note'
                      : last
                        ? previewText(
                            last.content,
                            last.hasImage,
                            last.hasAudio,
                            last.kind,
                            last.senderId === me._id,
                          )
                        : 'Nouvelle conversation'
              const previewEmphasis = Boolean(leftover || activity || unread)
              const others = conversation.members.filter((member) => member._id !== me._id)
              const otherUser = conversation.kind === 'group' ? null : conversation.otherUser
              const title =
                conversation.kind === 'group'
                  ? conversation.title || others.map((member) => member.name).join(', ')
                  : otherUser?.name ?? 'Conversation'

              return (
                <div
                  key={conversation._id}
                  className={`group relative flex w-full items-center ${
                    selected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                  }`}
                >
                  <button
                    onClick={() => onSelect(conversation._id)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 pl-4 text-left"
                  >
                    {conversation.kind === 'group' ? (
                      <GroupAvatar
                        name={title}
                        imageUrl={conversation.imageUrl}
                      />
                    ) : (
                      <Avatar
                        name={conversation.otherUser?.name ?? 'User'}
                        imageUrl={conversation.otherUser?.imageUrl}
                        lastSeenAt={conversation.otherUser?.lastSeenAt}
                        showStatus
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${previewEmphasis ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'}`}
                      >
                        <span className="truncate">{title}</span>
                        {leftover && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        )}
                      </p>
                      <p
                        className={`mt-0.5 truncate text-xs ${
                          leftover
                            ? 'font-medium text-brand'
                            : activity
                              ? 'font-bold text-neutral-900'
                              : unread
                                ? 'font-semibold text-neutral-900'
                                : 'text-neutral-500'
                        }`}
                      >
                        {preview}
                      </p>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-3 pr-3">
                    <span className="text-[11px] leading-none text-neutral-500">
                      {formatListTime(conversation.lastMessageAt)}
                    </span>
                    <div className="relative" data-conv-menu>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setMenuId((current) =>
                            current === conversation._id ? null : conversation._id,
                          )
                        }}
                        className="rounded-lg p-1.5 text-neutral-400 opacity-100 hover:bg-white hover:text-neutral-700 md:opacity-0 md:group-hover:opacity-100"
                        aria-label="Options de la conversation"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuId === conversation._id && (
                        <div className="absolute top-8 right-0 z-20 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
                          {otherUser && (
                            <button
                              type="button"
                              onClick={() =>
                                void toggleBlock(
                                  otherUser._id,
                                  Boolean(conversation.blockStatus?.iBlocked),
                                )
                              }
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              {conversation.blockStatus?.iBlocked ? 'Débloquer' : 'Bloquer'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void removeConversation(conversation._id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-neutral-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
