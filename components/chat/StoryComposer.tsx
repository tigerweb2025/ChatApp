'use client'

import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { ImageIcon, Type, Video, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_VIDEO_BYTES = 20 * 1024 * 1024
const BACKGROUNDS = ['#171717', '#6d28d9', '#0f766e', '#b45309', '#be185d']

type Mode = 'text' | 'image' | 'video'

export default function StoryComposer({ onClose }: { onClose: () => void }) {
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const create = useMutation(api.stories.create)
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('text')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [background, setBackground] = useState(BACKGROUNDS[0])
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function pick(next: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    if (next === null) {
      setFile(null)
      setPreview(null)
      return
    }
    if (mode === 'image' && !next.type.startsWith('image/')) {
      setError('Choisis une image.')
      return
    }
    if (mode === 'video' && !next.type.startsWith('video/')) {
      setError('Choisis une vidéo.')
      return
    }
    if (mode === 'image' && next.size > MAX_IMAGE_BYTES) {
      setError('Image trop lourde (max 6 Mo).')
      return
    }
    if (mode === 'video' && next.size > MAX_VIDEO_BYTES) {
      setError('Vidéo trop lourde (max 20 Mo).')
      return
    }
    setError(null)
    setFile(next)
    setPreview(URL.createObjectURL(next))
  }

  async function publish() {
    if (mode === 'text' && text.trim().length === 0) {
      setError('Écris un texte.')
      return
    }
    if ((mode === 'image' || mode === 'video') && file === null) {
      setError(mode === 'image' ? 'Ajoute une photo.' : 'Ajoute une vidéo.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let imageId: Id<'_storage'> | undefined
      let videoId: Id<'_storage'> | undefined
      if (file !== null) {
        const uploadUrl = await generateUploadUrl()
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!response.ok) throw new Error('Upload impossible')
        const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
        if (mode === 'video') videoId = storageId
        else imageId = storageId
      }
      await create({
        imageId,
        videoId,
        text: mode === 'text' ? text.trim() : undefined,
        background: mode === 'text' ? background : undefined,
        caption: caption.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publication impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-sm font-semibold">Nouvelle story</p>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-5 mt-4 flex rounded-xl bg-neutral-100 p-1">
          {(
            [
              ['text', Type, 'Texte'],
              ['image', ImageIcon, 'Photo'],
              ['video', Video, 'Vidéo'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id)
                pick(null)
                setError(null)
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs ${
                mode === id ? 'bg-white font-medium shadow-sm' : 'text-neutral-500'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 pt-4">
          {mode === 'text' ? (
            <div className="overflow-hidden rounded-2xl" style={{ background }}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={180}
                rows={5}
                placeholder="Écris ta story…"
                className="w-full resize-none bg-transparent px-4 py-5 text-center text-base font-medium text-white outline-none placeholder:text-white/50"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl bg-neutral-100"
            >
              {preview && mode === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : preview && mode === 'video' ? (
                <video src={preview} className="h-full w-full object-cover" muted />
              ) : (
                <span className="text-sm text-neutral-400">
                  {mode === 'image' ? 'Choisir une photo' : 'Choisir une vidéo'}
                </span>
              )}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={mode === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp'}
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>

        {mode === 'text' && (
          <div className="flex justify-center gap-2 px-5 pt-3">
            {BACKGROUNDS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setBackground(color)}
                className={`h-6 w-6 rounded-full ring-2 ${
                  background === color ? 'ring-neutral-900' : 'ring-transparent'
                }`}
                style={{ background: color }}
                aria-label={color}
              />
            ))}
          </div>
        )}

        {mode !== 'text' && (
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={120}
            placeholder="Légende (optionnel)"
            className="mx-5 mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
          />
        )}

        {error && <p className="px-5 pt-2 text-xs text-red-500">{error}</p>}

        <button
          type="button"
          onClick={() => void publish()}
          disabled={saving}
          className="m-5 rounded-xl bg-brand py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? 'Publication…' : 'Partager'}
        </button>
      </div>
    </div>
  )
}
