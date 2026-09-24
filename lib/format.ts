const ONLINE_MS = 90_000

export function isOnline(lastSeenAt?: number): boolean {
  if (lastSeenAt === undefined) return false
  return Date.now() - lastSeenAt < ONLINE_MS
}

export function formatListTime(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Hier'
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function previewText(
  content: string,
  hasImage: boolean,
  hasAudio = false,
  kind?: string,
  fromMe = false,
): string {
  if (kind === 'story_reply') {
    return fromMe ? 'Vous avez répondu à une story' : 'a répondu à votre story'
  }
  if (kind === 'note_reply') {
    return fromMe ? 'Vous avez répondu à une note' : 'a répondu à votre note'
  }
  if (content.trim().length > 0) return content
  if (hasAudio) return 'Message vocal'
  if (hasImage) return 'Photo'
  return 'Nouvelle conversation'
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function ageLabel(age: number | null): string | null {
  if (age === null) return null
  return `${age} ans`
}
