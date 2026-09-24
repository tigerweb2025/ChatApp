'use client'

import { Plus } from 'lucide-react'
import type { Id } from '@/convex/_generated/dataModel'
import Avatar from './Avatar'

type Pack = {
  user: {
    _id: Id<'users'>
    name: string
    imageUrl?: string
    note?: string
  }
  stories: { _id: Id<'stories'>; viewed: boolean }[]
  hasUnseen: boolean
}

type NoteItem = {
  user: { _id: Id<'users'>; name: string; imageUrl?: string; note?: string }
  note: string
}

export default function StoryBar({
  feed,
  notes,
  meId,
  me,
  onOpen,
  onCompose,
  onOpenNote,
}: {
  feed: Pack[]
  notes: NoteItem[]
  meId: Id<'users'>
  me: { name: string; imageUrl?: string; note?: string }
  onOpen: (userId: Id<'users'>, storyId?: Id<'stories'>) => void
  onCompose: () => void
  onOpenNote: (userId: Id<'users'>) => void
}) {
  const mine = feed.find((pack) => pack.user._id === meId)
  const hasOwnStories = (mine?.stories.length ?? 0) > 0
  const noteByUser = new Map(notes.map((item) => [item.user._id as string, item]))

  const others: {
    user: Pack['user']
    stories: Pack['stories']
    hasUnseen: boolean
    note?: string
  }[] = []
  const seen = new Set<string>([meId])

  for (const pack of feed) {
    if (pack.user._id === meId) continue
    seen.add(pack.user._id)
    others.push({
      ...pack,
      note: noteByUser.get(pack.user._id)?.note ?? pack.user.note,
    })
  }
  for (const item of notes) {
    if (seen.has(item.user._id)) continue
    seen.add(item.user._id)
    others.push({
      user: item.user,
      stories: [],
      hasUnseen: false,
      note: item.note,
    })
  }

  const myNote = me.note ?? noteByUser.get(meId)?.note

  return (
    <div className="overflow-x-auto [scrollbar-width:none]">
    <div className="flex gap-4 px-4 pt-8 pb-3">
      <div className="flex w-[72px] shrink-0 flex-col items-center gap-1.5">
        <div className="relative pt-3">
          <button
            type="button"
            onClick={() => {
              if (hasOwnStories) onOpen(meId, mine?.stories[0]?._id)
              else if (myNote) onOpenNote(meId)
              else onCompose()
            }}
          >
            <Avatar
              name={me.name}
              imageUrl={me.imageUrl}
              size="lg"
              ring={hasOwnStories ? 'unseen' : 'none'}
              note={myNote}
              onNoteClick={myNote ? () => onOpenNote(meId) : undefined}
            />
          </button>
          <button
            type="button"
            onClick={onCompose}
            className="absolute right-0 bottom-0 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white ring-2 ring-white"
            aria-label="Ajouter une story"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <span className="w-full truncate text-center text-[11px] text-neutral-500">Toi</span>
      </div>

      {others.map((pack) => {
        const hasStories = pack.stories.length > 0
        return (
          <button
            key={pack.user._id}
            type="button"
            onClick={() => {
              if (hasStories) onOpen(pack.user._id, pack.stories[0]?._id)
              else if (pack.note) onOpenNote(pack.user._id)
            }}
            className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 pt-3"
          >
            <Avatar
              name={pack.user.name}
              imageUrl={pack.user.imageUrl}
              size="lg"
              ring={hasStories ? (pack.hasUnseen ? 'unseen' : 'seen') : 'none'}
              note={pack.note}
              onNoteClick={pack.note ? () => onOpenNote(pack.user._id) : undefined}
            />
            <span className="w-full truncate text-center text-[11px] text-neutral-600">
              {pack.user.name.split(' ')[0]}
            </span>
          </button>
        )
      })}
    </div>
    </div>
  )
}
