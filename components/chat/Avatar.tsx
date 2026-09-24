import { initials, isOnline } from '@/lib/format'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const sizes: Record<Size, string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-sm',
  xl: 'h-24 w-24 text-2xl',
}

export default function Avatar({
  name,
  imageUrl,
  lastSeenAt,
  showStatus = false,
  size = 'md',
  className = '',
  ring = 'none',
  liked = false,
  note,
  onNoteClick,
}: {
  name: string
  imageUrl?: string
  lastSeenAt?: number
  showStatus?: boolean
  size?: Size
  className?: string
  ring?: 'none' | 'unseen' | 'seen'
  liked?: boolean
  note?: string
  onNoteClick?: () => void
}) {
  const online = isOnline(lastSeenAt)
  const face = (
    <div className={`relative ${sizes[size]}`}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-brand text-white">
          {initials(name)}
        </div>
      )}
      {showStatus && ring === 'none' && (
        <span
          className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
            online ? 'bg-emerald-500' : 'bg-neutral-300'
          }`}
        />
      )}
      {liked && (
        <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm">
          <span className="text-[9px] leading-none">❤️</span>
        </span>
      )}
    </div>
  )

  return (
    <div className={`relative shrink-0 ${className}`}>
      <div className="relative z-0">
        {ring === 'none' ? (
          face
        ) : (
          <div
            className={`rounded-full p-[2px] ${
              ring === 'unseen' ? 'story-ring' : 'bg-brand-ring'
            }`}
          >
            <div className="rounded-full bg-white p-[2px]">{face}</div>
          </div>
        )}
      </div>
      {note && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onNoteClick?.()
          }}
          className="note-bubble absolute top-0 left-1/2 z-20 w-[68px] max-w-[68px] -translate-x-1/2 -translate-y-1/2 truncate rounded-2xl bg-white px-2 py-1 text-[10px] leading-tight font-medium text-neutral-800 shadow-md"
        >
          {note}
        </button>
      )}
    </div>
  )
}
