import { Users } from 'lucide-react'
import { initials } from '@/lib/format'

const boxes = {
  sm: 'h-9 w-9 text-[11px]',
  md: 'h-11 w-11 text-xs',
  lg: 'h-24 w-24 text-2xl',
}

const badges = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-7 w-7',
}

const icons = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3.5 w-3.5',
}

export default function GroupAvatar({
  name,
  imageUrl,
  size = 'md',
}: {
  name: string
  imageUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div className={`relative shrink-0 ${boxes[size]}`}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-brand font-semibold text-white">
          {initials(name)}
        </div>
      )}
      <span
        className={`absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-brand text-white ring-2 ring-white ${badges[size]}`}
      >
        <Users className={icons[size]} />
      </span>
    </div>
  )
}
