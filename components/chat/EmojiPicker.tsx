'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { ALL_EMOJIS, EMOJI_CATEGORIES, QUICK_REACTIONS } from '@/lib/emojis'

export default function EmojiPicker({
  onSelect,
  onClose,
  compact = false,
}: {
  onSelect: (emoji: string) => void
  onClose?: () => void
  compact?: boolean
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(EMOJI_CATEGORIES[0].id)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose?.()
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const emojis = useMemo(() => {
    const q = query.trim()
    if (q.length > 0) {
      return ALL_EMOJIS.filter((emoji) => emoji.includes(q)).slice(0, 80)
    }
    return EMOJI_CATEGORIES.find((c) => c.id === category)?.emojis ?? ALL_EMOJIS
  }, [category, query])

  return (
    <div
      ref={rootRef}
      className="w-[min(100%,320px)] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
    >
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-100 px-2 py-2">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-neutral-100"
          >
            {emoji}
          </button>
        ))}
      </div>
      {!compact && (
        <label className="mx-2 mt-2 flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher"
            className="w-full bg-transparent text-xs outline-none"
          />
        </label>
      )}
      <div className="flex gap-1 overflow-x-auto px-2 py-2">
        {EMOJI_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setCategory(item.id)
              setQuery('')
            }}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
              category === item.id && query.length === 0
                ? 'bg-brand text-white'
                : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {emojis.map((emoji, index) => (
          <button
            key={`${emoji}-${index}`}
            type="button"
            onClick={() => onSelect(emoji)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-neutral-100"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
