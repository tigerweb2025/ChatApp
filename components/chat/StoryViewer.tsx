'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Eye, Heart, Send, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import Avatar from './Avatar'

const STORY_MS = 5000

type Pack = {
  user: {
    _id: Id<'users'>
    name: string
    username?: string
    imageUrl?: string
  }
  stories: {
    _id: Id<'stories'>
    imageUrl: string | null
    videoUrl: string | null
    text?: string
    background?: string
    createdAt: number
    caption?: string
    viewed: boolean
    likedByMe: boolean
  }[]
  startIndex?: number
}

export default function StoryViewer({
  pack,
  meId,
  onClose,
  onEnded,
}: {
  pack: Pack
  meId: Id<'users'>
  onClose: () => void
  onEnded?: () => void
}) {
  const markViewed = useMutation(api.stories.markViewed)
  const toggleLike = useMutation(api.stories.toggleLike)
  const sendStoryReply = useMutation(api.messages.sendStoryReply)
  const [index, setIndex] = useState(pack.startIndex ?? 0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reply, setReply] = useState('')
  const [replyFocused, setReplyFocused] = useState(false)
  const [liked, setLiked] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const holdingRef = useRef(false)
  const draftsRef = useRef(new Map<string, string>())
  const composing = replyFocused || reply.trim().length > 0
  const frameRef = useRef<number | null>(null)
  const lastRef = useRef<number>(0)
  const progressRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const story = pack.stories[index]
  const isVideo = Boolean(story?.videoUrl)
  const mine = pack.user._id === meId
  const viewers = useQuery(api.stories.viewers, mine && story ? { storyId: story._id } : 'skip')

  const storiesKey = useMemo(() => pack.stories.map((item) => item._id).join(','), [pack.stories])

  useEffect(() => {
    draftsRef.current.clear()
    setReply('')
    setReplyFocused(false)
    setIndex(pack.startIndex ?? 0)
    setProgress(0)
  }, [pack.user._id, storiesKey, pack.startIndex])

  useEffect(() => {
    if (!story) return
    setLiked(story.likedByMe)
    void markViewed({ storyId: story._id })
  }, [markViewed, story])

  useEffect(() => {
    function onVis() {
      if (document.hidden) setPaused(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (video === null || !isVideo) return
    const el = video
    function onTime() {
      if (!el.duration) return
      setProgress(el.currentTime / el.duration)
    }
    function onEnd() {
      go(1)
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    void el.play().catch(() => undefined)
    return () => {
      el.pause()
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
      el.removeAttribute('src')
      el.load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?._id, isVideo])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideo) return
    if (paused || composing || viewsOpen || document.hidden) video.pause()
    else void video.play().catch(() => undefined)
  }, [isVideo, paused, composing, viewsOpen, story?._id])

  useEffect(() => {
    if (!story || viewsOpen || isVideo || composing) return
    lastRef.current = performance.now()
    progressRef.current = 0
    setProgress(0)
    function tick(now: number) {
      const delta = now - lastRef.current
      lastRef.current = now
      if (!paused && !holdingRef.current && !document.hidden) {
        progressRef.current += delta / STORY_MS
        if (progressRef.current >= 1) {
          progressRef.current = 0
          setProgress(0)
          go(1)
        } else {
          setProgress(progressRef.current)
        }
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?._id, paused, viewsOpen, composing])

  function go(delta: number) {
    if (story) {
      if (reply.trim().length > 0) draftsRef.current.set(story._id, reply)
      else draftsRef.current.delete(story._id)
    }
    const next = index + delta
    if (next < 0) return
    if (next >= pack.stories.length) {
      onEnded?.()
      onClose()
      return
    }
    setProgress(0)
    setReply(draftsRef.current.get(pack.stories[next]._id) ?? '')
    setReplyFocused(false)
    setIndex(next)
  }

  async function like() {
    if (!story || mine) return
    const next = await toggleLike({ storyId: story._id })
    setLiked(next)
  }

  async function sendReply() {
    if (!story || reply.trim().length === 0) return
    try {
      await sendStoryReply({ storyId: story._id, content: reply })
      draftsRef.current.delete(story._id)
      setReply('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible')
    }
  }

  if (!story) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="relative flex h-full w-full max-w-md flex-col">
        <div className="absolute inset-x-0 top-0 z-10 px-3 pt-3">
          <div className="mb-3 flex gap-1">
            {pack.stories.map((item, i) => (
              <div key={item._id} className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full bg-white"
                  style={{
                    width: i < index ? '100%' : i === index ? `${progress * 100}%` : '0%',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Avatar name={pack.user.name} imageUrl={pack.user.imageUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{pack.user.name}</p>
              <p className="text-[11px] text-white/60">
                {new Date(story.createdAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            {mine && (
              <button
                type="button"
                onClick={() => {
                  setPaused(true)
                  setViewsOpen(true)
                }}
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-white"
                aria-label="Vues"
              >
                <Eye className="h-4 w-4" />
                <span className="text-[11px]">{viewers?.length ?? 0}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className="relative min-h-0 flex-1"
          onPointerDown={() => {
            holdingRef.current = true
            videoRef.current?.pause()
          }}
          onPointerUp={() => {
            holdingRef.current = false
            if (!paused && !composing && !viewsOpen) {
              void videoRef.current?.play().catch(() => undefined)
            }
          }}
          onPointerCancel={() => {
            holdingRef.current = false
          }}
          onClick={(event) => {
            const x = event.clientX
            const mid = window.innerWidth / 2
            if (x < mid) go(-1)
            else go(1)
          }}
        >
          {story.videoUrl && (
            <video
              ref={videoRef}
              src={story.videoUrl}
              className="h-full w-full object-contain"
              playsInline
              preload="auto"
            />
          )}
          {story.imageUrl && !story.videoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={story.imageUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          )}
          {story.text && (
            <div
              className="flex h-full w-full items-center justify-center px-8 text-center text-2xl font-semibold text-white"
              style={{ background: story.background ?? '#171717' }}
            >
              {story.text}
            </div>
          )}
          {story.caption && (
            <p className="absolute inset-x-4 bottom-28 rounded-2xl bg-black/40 px-3 py-2 text-center text-sm text-white">
              {story.caption}
            </p>
          )}
        </div>

        {!mine && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 p-3">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => setReplyFocused(true)}
              onBlur={() => setReplyFocused(false)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Répondre à la story…"
              className="flex-1 rounded-full bg-white/15 px-4 py-2 text-sm text-white outline-none placeholder:text-white/50"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void sendReply()
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-900"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void like()
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                liked ? 'bg-white text-red-500' : 'bg-white/15 text-white'
              }`}
              aria-label="Liker"
            >
              <Heart className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
            </button>
          </div>
        )}
        {error && (
          <p className="absolute inset-x-0 bottom-16 z-10 text-center text-xs text-red-300">
            {error}
          </p>
        )}
      </div>

      {viewsOpen && (
        <div
          className="absolute inset-0 z-20 flex items-end bg-black/50"
          onClick={() => {
            setViewsOpen(false)
            setPaused(false)
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[55vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4"
          >
            <p className="mb-3 text-sm font-semibold">Vues</p>
            {viewers?.length === 0 && (
              <p className="text-sm text-neutral-400">Personne n’a encore vu.</p>
            )}
            {viewers?.map((row) => (
              <div key={row.user._id} className="flex items-center gap-3 py-2">
                <Avatar
                  name={row.user.name}
                  imageUrl={row.user.imageUrl}
                  size="sm"
                  liked={row.liked}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.user.name}</p>
                  <p className="text-[11px] text-neutral-400">
                    {new Date(row.viewedAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
