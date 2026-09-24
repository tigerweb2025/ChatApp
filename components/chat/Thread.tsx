'use client'

import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { BarChart3, ChevronLeft, ImagePlus, Mic, RefreshCw, Send, Smile, Square, X } from 'lucide-react'
import AiIcon from './AiIcon'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { formatDuration, isOnline } from '@/lib/format'
import Avatar from './Avatar'
import EmojiPicker from './EmojiPicker'
import ForwardModal from './ForwardModal'
import GroupAvatar from './GroupAvatar'
import GroupPanel from './GroupPanel'
import MessageBubble from './MessageBubble'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_AUDIO_BYTES = 5 * 1024 * 1024

type Conversation = {
  _id: Id<'conversations'>
  kind: 'dm' | 'group'
  title?: string
  otherUser: {
    _id: Id<'users'>
    name: string
    username?: string
    imageUrl?: string
    lastSeenAt?: number
    bio?: string
    age: number | null
    note?: string
  } | null
  members: {
    _id: Id<'users'>
    name: string
    username?: string
    imageUrl?: string
    lastSeenAt?: number
    bio?: string
    age: number | null
    note?: string
  }[]
  blockStatus: {
    iBlocked: boolean
    theyBlocked: boolean
    leftoverAvailable: boolean
    leftoverMessage?: string
    incomingLeftover?: string
    leftoverRevealed: boolean
  } | null
  imageUrl: string | null
  description?: string
  writePolicy: 'all' | 'admins'
  createdAt: number
  myRole: 'admin' | 'member' | null
  adminIds: Id<'users'>[]
  deleteVotes: Id<'users'>[]
  memberRoles: { userId: Id<'users'>; role: 'admin' | 'member' }[]
  otherLastReadAt: number | null
}

async function peaksFromBlob(blob: Blob, bars = 28): Promise<number[]> {
  const context = new AudioContext()
  const buffer = await context.decodeAudioData(await blob.arrayBuffer())
  const data = buffer.getChannelData(0)
  const block = Math.max(1, Math.floor(data.length / bars))
  const peaks: number[] = []
  for (let i = 0; i < bars; i += 1) {
    let max = 0
    const start = i * block
    for (let j = 0; j < block; j += 1) {
      max = Math.max(max, Math.abs(data[start + j] ?? 0))
    }
    peaks.push(Math.min(1, max))
  }
  await context.close()
  return peaks
}

export default function Thread({
  conversation,
  meId,
  onBack,
  onOpenStory,
  onOpenProfile,
}: {
  conversation: Conversation
  meId: Id<'users'>
  onBack: () => void
  onOpenStory?: (storyId: Id<'stories'>) => void
  onOpenProfile?: (userId: Id<'users'>) => void
}) {
  const conversationId = conversation._id
  const markAsRead = useMutation(api.conversations.markAsRead)
  const sendMessage = useMutation(api.messages.sendMessage)
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl)
  const sendImage = useMutation(api.messages.sendImage)
  const sendAudio = useMutation(api.messages.sendAudio)
  const setTyping = useMutation(api.typing.setTyping)
  const editMessage = useMutation(api.messages.editMessage)
  const unsendMessage = useMutation(api.messages.unsendMessage)
  const deleteForMe = useMutation(api.messages.deleteForMe)
  const toggleReaction = useMutation(api.messages.toggleReaction)
  const votePoll = useMutation(api.messages.votePoll)
  const sendPoll = useMutation(api.messages.sendPoll)
  const unblockUser = useMutation(api.blocks.unblockUser)
  const revealLeftover = useMutation(api.blocks.revealLeftover)
  const suggestReplies = useAction(api.ai.suggestReplies)
  const typingNames = useQuery(api.typing.getTyping, { conversationId })

  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.listMessages,
    { conversationId },
    { initialNumItems: 30 },
  )

  const messages = [...results].reverse()
  const isBlockedNow = Boolean(
    conversation.blockStatus?.iBlocked || conversation.blockStatus?.theyBlocked,
  )
  const leftoverMessages = isBlockedNow
    ? messages.filter((message) => message.kind === 'block_note')
    : []
  const threadMessages = isBlockedNow
    ? messages.filter((message) => message.kind !== 'block_note')
    : messages
  const leftoverFallback =
    leftoverMessages.length === 0
      ? conversation.blockStatus?.incomingLeftover ??
        conversation.blockStatus?.leftoverMessage
      : undefined
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [editingId, setEditingId] = useState<Id<'messages'> | null>(null)
  const [forwardId, setForwardId] = useState<Id<'messages'> | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<{
    _id: Id<'messages'>
    content: string
    hasAudio?: boolean
    hasImage?: boolean
    audioDurationMs?: number
  } | null>(null)
  const [highlightId, setHighlightId] = useState<Id<'messages'> | null>(null)
  const [pollOpen, setPollOpen] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [recording, setRecording] = useState(false)
  const [recordMs, setRecordMs] = useState(0)
  const [liveBars, setLiveBars] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.2))
  const [voiceDraft, setVoiceDraft] = useState<{
    blob: Blob
    durationMs: number
    waveform: number[]
    url: string
  } | null>(null)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastTypedRef = useRef(0)
  const stopTypingRef = useRef<number | null>(null)
  const prevHeightRef = useRef(0)
  const loadingOlderRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const tickRef = useRef<number | null>(null)
  const finishingRef = useRef(false)
  const pendingJumpRef = useRef<Id<'messages'> | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

  useEffect(() => {
    void markAsRead({ conversationId })
  }, [conversationId, markAsRead, results.length])

  useEffect(() => {
    if (
      !conversation.blockStatus?.iBlocked ||
      !conversation.blockStatus.incomingLeftover ||
      conversation.blockStatus.leftoverRevealed
    ) {
      return
    }
    void revealLeftover({ conversationId })
  }, [
    conversationId,
    conversation.blockStatus?.iBlocked,
    conversation.blockStatus?.incomingLeftover,
    conversation.blockStatus?.leftoverRevealed,
    revealLeftover,
  ])

  useEffect(() => {
    const el = scrollerRef.current
    if (el === null) return
    if (loadingOlderRef.current) {
      el.scrollTop = el.scrollHeight - prevHeightRef.current
      loadingOlderRef.current = false
      return
    }
    if (pendingJumpRef.current !== null) return
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [results, typingNames])

  useEffect(() => {
    const target = pendingJumpRef.current
    if (target === null) return
    const node = document.getElementById(`msg-${target}`)
    if (node) {
      atBottomRef.current = false
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightId(target)
      pendingJumpRef.current = null
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightId((current) => (current === target ? null : current))
      }, 2000)
      return
    }
    if (status === 'CanLoadMore' && !loadingOlderRef.current) {
      const el = scrollerRef.current
      loadingOlderRef.current = true
      prevHeightRef.current = el?.scrollHeight ?? 0
      loadMore(40)
      return
    }
    if (status === 'Exhausted') pendingJumpRef.current = null
  }, [results, status, loadMore])

  useEffect(() => {
    setSuggestions(null)
    setEditingId(null)
    setText('')
    setEmojiOpen(false)
    setReplyTo(null)
    setHighlightId(null)
    pendingJumpRef.current = null
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = null
    }
    setVoiceDraft((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    return () => {
      if (stopTypingRef.current !== null) window.clearTimeout(stopTypingRef.current)
      void setTyping({ conversationId, isTyping: false }).catch(() => undefined)
      stopRecording(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, setTyping])

  function onScroll() {
    const el = scrollerRef.current
    if (el === null) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 72 && status === 'CanLoadMore' && !loadingOlderRef.current) {
      loadingOlderRef.current = true
      prevHeightRef.current = el.scrollHeight
      loadMore(25)
    }
  }

  function pingTyping() {
    const now = Date.now()
    if (now - lastTypedRef.current > 400) {
      void setTyping({ conversationId, isTyping: true }).catch(() => undefined)
      lastTypedRef.current = now
    }
    if (stopTypingRef.current !== null) window.clearTimeout(stopTypingRef.current)
    stopTypingRef.current = window.setTimeout(() => {
      void setTyping({ conversationId, isTyping: false }).catch(() => undefined)
    }, 2000)
  }

  function pickFile(next: File | null) {
    if (preview !== null) URL.revokeObjectURL(preview)
    if (next === null) {
      setFile(null)
      setPreview(null)
      return
    }
    if (!next.type.startsWith('image/')) {
      setError('Seules les images sont acceptées.')
      return
    }
    if (next.size > MAX_IMAGE_BYTES) {
      setError('Image trop lourde (max 4 Mo).')
      return
    }
    setError(null)
    setFile(next)
    setPreview(URL.createObjectURL(next))
  }

  async function handleSend() {
    if (voiceDraft !== null) {
      await sendVoiceDraft()
      return
    }
    const content = text.trim()
    if (editingId !== null) {
      if (content.length === 0) return
      setSending(true)
      setError(null)
      try {
        await editMessage({ messageId: editingId, content })
        setEditingId(null)
        setText('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Modification impossible')
      } finally {
        setSending(false)
      }
      return
    }
    if ((!content && file === null) || sending) return
    setSending(true)
    setError(null)
    try {
      if (file !== null) {
        const uploadUrl = await generateUploadUrl()
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!response.ok) throw new Error('Upload impossible')
        const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
        await sendImage({
          conversationId,
          storageId,
          caption: content || undefined,
          replyToId: replyTo?._id,
        })
        pickFile(null)
        setReplyTo(null)
      } else {
        await sendMessage({
          conversationId,
          content,
          replyToId: conversation.blockStatus?.theyBlocked ? undefined : replyTo?._id,
        })
        setReplyTo(null)
      }
      setText('')
      setSuggestions(null)
      atBottomRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible')
    } finally {
      setSending(false)
    }
  }

  async function handleSuggest() {
    if (suggesting) return
    setSuggesting(true)
    setError(null)
    try {
      const next = await suggestReplies({ conversationId })
      setSuggestions(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suggestions impossibles')
    } finally {
      setSuggesting(false)
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.start()
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      setRecording(true)
      setRecordMs(0)
      tickRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current
        setRecordMs(elapsed)
        setLiveBars(Array.from({ length: 24 }, () => 0.2 + Math.random() * 0.8))
        if (elapsed >= 60_000) void stopToPreview()
      }, 120)
    } catch {
      setError('Micro inaccessible. Autorise-le dans le navigateur.')
    }
  }

  function stopRecording(keep = false) {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      if (!keep) recorder.ondataavailable = null
      recorder.stop()
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setRecording(false)
  }

  async function stopToPreview() {
    const recorder = recorderRef.current
    if (recorder === null || finishingRef.current) return
    finishingRef.current = true
    const durationMs = Date.now() - startedAtRef.current
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }
      stopRecording(true)
    })
    if (durationMs < 400) {
      finishingRef.current = false
      return
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      setError('Vocal trop lourd.')
      finishingRef.current = false
      return
    }
    try {
      const waveform = await peaksFromBlob(blob)
      setVoiceDraft({
        blob,
        durationMs,
        waveform,
        url: URL.createObjectURL(blob),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vocal impossible')
    } finally {
      finishingRef.current = false
    }
  }

  async function sendVoiceDraft() {
    if (voiceDraft === null || sending) return
    setSending(true)
    setError(null)
    try {
      const uploadUrl = await generateUploadUrl()
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': voiceDraft.blob.type || 'audio/webm' },
        body: voiceDraft.blob,
      })
      if (!response.ok) throw new Error('Upload du vocal impossible')
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
      await sendAudio({
        conversationId,
        storageId,
        durationMs: voiceDraft.durationMs,
        waveform: voiceDraft.waveform,
        replyToId: replyTo?._id,
      })
      URL.revokeObjectURL(voiceDraft.url)
      setVoiceDraft(null)
      setReplyTo(null)
      atBottomRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vocal impossible')
    } finally {
      setSending(false)
      finishingRef.current = false
    }
  }

  const isGroup = conversation.kind === 'group'
  const others = conversation.members.filter((member) => member._id !== meId)
  const title = isGroup
    ? conversation.title || others.map((member) => member.name).join(', ')
    : conversation.otherUser?.name ?? 'Conversation'
  const subtitle = isGroup
    ? `${conversation.members.length} membres`
    : conversation.otherUser && isOnline(conversation.otherUser.lastSeenAt)
      ? 'En ligne'
      : conversation.otherUser?.username
        ? `@${conversation.otherUser.username}`
        : 'Hors ligne'

  const senderName = (senderId: Id<'users'>) =>
    conversation.members.find((member) => member._id === senderId)?.name

  return (
    <div className="relative flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-3 py-3 md:px-5">
        <button
          onClick={onBack}
          className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 md:hidden"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (isGroup) setGroupOpen(true)
            else if (conversation.otherUser) onOpenProfile?.(conversation.otherUser._id)
          }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-0.5 text-left hover:bg-neutral-50"
        >
          {isGroup ? (
            <GroupAvatar
              name={title}
              size="sm"
              imageUrl={conversation.imageUrl}
            />
          ) : (
            <Avatar
              name={conversation.otherUser?.name ?? 'User'}
              imageUrl={conversation.otherUser?.imageUrl}
              lastSeenAt={conversation.otherUser?.lastSeenAt}
              showStatus
              size="sm"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="truncate text-xs text-neutral-400">{subtitle}</p>
          </div>
        </button>
      </header>

      {conversation.blockStatus?.iBlocked && (
        <div className="flex items-center justify-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 text-center text-xs text-neutral-600">
          <span>vous avez bloqué {title}</span>
          <button
            type="button"
            onClick={() => {
              if (conversation.otherUser) {
                void unblockUser({ userId: conversation.otherUser._id })
              }
            }}
            className="rounded-full bg-brand px-2 py-0.5 text-[11px] text-white"
          >
            Débloquer
          </button>
        </div>
      )}
      {conversation.blockStatus?.theyBlocked && (
        <div className="border-b border-neutral-200 bg-white px-4 py-2 text-center text-xs text-neutral-500">
          {title} vous a bloqué
        </div>
      )}

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6"
      >
        {status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <p className="py-2 text-center text-xs text-neutral-400">
            {status === 'LoadingMore' ? 'Chargement…' : 'Remonte pour l’historique'}
          </p>
        ) : null}

        {threadMessages.map((message) => (
          <MessageBubble
            key={message._id}
            message={message}
            mine={message.senderId === meId}
            meId={meId}
            showSender={isGroup && message.senderId !== meId}
            senderName={senderName(message.senderId)}
            onEdit={(item) => {
              setEditingId(item._id)
              setText(item.content)
            }}
            onUnsend={(id) => void unsendMessage({ messageId: id })}
            onDelete={(id) => void deleteForMe({ messageId: id })}
            onForward={setForwardId}
            onReact={(id, emoji) => void toggleReaction({ messageId: id, emoji })}
            onOpenStory={onOpenStory}
            onReply={(item) =>
              setReplyTo({
                _id: item._id,
                content: item.content,
                hasAudio: Boolean(item.audioUrl),
                hasImage: Boolean(item.imageUrl),
                audioDurationMs: item.audioDurationMs,
              })
            }
            onJumpTo={(id) => {
              atBottomRef.current = false
              pendingJumpRef.current = id
              const node = document.getElementById(`msg-${id}`)
              if (node) {
                node.scrollIntoView({ behavior: 'smooth', block: 'center' })
                setHighlightId(id)
                if (highlightTimerRef.current !== null) {
                  window.clearTimeout(highlightTimerRef.current)
                }
                highlightTimerRef.current = window.setTimeout(() => {
                  setHighlightId((current) => (current === id ? null : current))
                }, 2000)
                pendingJumpRef.current = null
                return
              }
              if (status === 'CanLoadMore' && !loadingOlderRef.current) {
                loadingOlderRef.current = true
                prevHeightRef.current = scrollerRef.current?.scrollHeight ?? 0
                loadMore(40)
              }
            }}
            highlighted={highlightId === message._id}
            onVote={(id, optionIndex) => void votePoll({ messageId: id, optionIndex })}
            showVu={
              !isGroup &&
              message.senderId === meId &&
              threadMessages[threadMessages.length - 1]?._id === message._id &&
              conversation.otherLastReadAt !== null &&
              conversation.otherLastReadAt >= message.createdAt &&
              !message.reactions.some((reaction) => reaction.userId !== meId)
            }
          />
        ))}

        {conversation.blockStatus?.iBlocked && (
          <div className="flex justify-center px-6 py-2">
            <p className="rounded-full bg-white px-3 py-1 text-center text-[11px] text-neutral-500 shadow-sm">
              vous avez bloqué {title}
            </p>
          </div>
        )}
        {conversation.blockStatus?.theyBlocked && (
          <div className="flex justify-center px-6 py-2">
            <p className="rounded-full bg-white px-3 py-1 text-center text-[11px] text-neutral-500 shadow-sm">
              {title} vous a bloqué
            </p>
          </div>
        )}
        {leftoverMessages.map((message) => (
          <MessageBubble
            key={message._id}
            message={message}
            mine={message.senderId === meId}
            meId={meId}
            onEdit={(item) => {
              setEditingId(item._id)
              setText(item.content)
            }}
            onUnsend={(id) => void unsendMessage({ messageId: id })}
            onDelete={(id) => void deleteForMe({ messageId: id })}
            onForward={setForwardId}
            onReact={(id, emoji) => void toggleReaction({ messageId: id, emoji })}
            onOpenStory={onOpenStory}
            onVote={(id, optionIndex) => void votePoll({ messageId: id, optionIndex })}
          />
        ))}
        {leftoverFallback && (
          <div
            className={`flex ${conversation.blockStatus?.iBlocked ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm text-white shadow-sm bg-[#c85a5a] ${
                conversation.blockStatus?.iBlocked ? 'rounded-bl-md' : 'rounded-br-md'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{leftoverFallback}</p>
            </div>
          </div>
        )}

        {typingNames && typingNames.length > 0 && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
              <p className="mt-1 text-[10px] text-neutral-400">
                {typingNames.length === 1
                  ? `${typingNames[0]} écrit…`
                  : `${typingNames.join(', ')} écrivent…`}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 bg-white px-3 py-3 md:px-5">
        {suggestions && (
          <div className="mb-3 rounded-2xl bg-neutral-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => void handleSuggest()}
                disabled={suggesting}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-white"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${suggesting ? 'animate-spin' : ''}`} />
                Regenerer
              </button>
              <button
                type="button"
                onClick={() => setSuggestions(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-white"
                aria-label="Fermer les suggestions"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setText(suggestion)
                    setSuggestions(null)
                  }}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-neutral-700 hover:border-neutral-900"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {preview && (
          <div className="mb-2 inline-flex items-start gap-2 rounded-xl bg-neutral-100 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <button
              onClick={() => pickFile(null)}
              className="rounded-full p-1 text-neutral-500 hover:bg-white"
              aria-label="Retirer l’image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {replyTo && !conversation.blockStatus?.theyBlocked && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border-l-2 border-brand bg-brand-soft px-3 py-2">
            <div className="min-w-0 flex-1 text-xs text-neutral-700">
              <p className="mb-0.5 font-medium text-brand">Réponse</p>
              {replyTo.hasAudio ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5" />
                  Message vocal
                  {replyTo.audioDurationMs
                    ? ` · ${formatDuration(replyTo.audioDurationMs)}`
                    : ''}
                </span>
              ) : (
                <p className="line-clamp-4 whitespace-pre-wrap break-words">
                  {replyTo.content || (replyTo.hasImage ? 'Photo' : 'Message')}
                </p>
              )}
            </div>
            <button onClick={() => setReplyTo(null)} className="font-medium text-xs text-neutral-500">
              Annuler
            </button>
          </div>
        )}

        {pollOpen && isGroup && (
          <div className="mb-3 rounded-2xl bg-neutral-50 p-3">
            <input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Question du sondage"
              className="w-full rounded-xl bg-white px-3 py-2 text-sm outline-none"
            />
            {pollOptions.map((option, index) => (
              <input
                key={index}
                value={option}
                onChange={(e) =>
                  setPollOptions((current) =>
                    current.map((item, i) => (i === index ? e.target.value : item)),
                  )
                }
                placeholder={`Choix ${index + 1}`}
                className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-sm outline-none"
              />
            ))}
            {pollOptions.length < 6 && (
              <button
                type="button"
                onClick={() => setPollOptions((current) => [...current, ''])}
                className="mt-2 text-xs text-neutral-500"
              >
                Ajouter un choix
              </button>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPollOpen(false)}
                className="flex-1 rounded-xl bg-white py-2 text-xs"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => {
                  void sendPoll({
                    conversationId,
                    question: pollQuestion,
                    options: pollOptions,
                  }).then(() => {
                    setPollOpen(false)
                    setPollQuestion('')
                    setPollOptions(['', ''])
                  })
                }}
                className="flex-1 rounded-xl bg-brand py-2 text-xs text-white"
              >
                Publier
              </button>
            </div>
          </div>
        )}

        {editingId && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Modification du message
            <button
              onClick={() => {
                setEditingId(null)
                setText('')
              }}
              className="font-medium"
            >
              Annuler
            </button>
          </div>
        )}

        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

        {isGroup && conversation.writePolicy === 'admins' && conversation.myRole !== 'admin' ? (
          <p className="py-2 text-center text-xs text-neutral-400">
            Seuls les admins peuvent écrire dans ce groupe.
          </p>
        ) : conversation.blockStatus?.iBlocked ? (
          <p className="py-2 text-center text-xs text-neutral-400">
            Débloque {title} pour écrire à nouveau.
          </p>
        ) : conversation.blockStatus?.theyBlocked &&
          !conversation.blockStatus.leftoverAvailable ? (
          <p className="py-2 text-center text-xs text-neutral-400">
            Tu as déjà envoyé ton unique message de 50 caractères.
          </p>
        ) : conversation.blockStatus?.theyBlocked ? (
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              rows={1}
              maxLength={50}
              onChange={(e) => setText(e.target.value)}
              placeholder={`envoyer un dernier message à ${title}`}
              className="max-h-24 min-h-10 flex-1 resize-none rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
            />
            <span className="text-[11px] text-neutral-400">{text.length}/50</span>
            <button
              onClick={() => void handleSend()}
              disabled={sending || text.trim().length === 0}
              className="rounded-xl bg-brand p-2 text-white disabled:opacity-30"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : recording ? (
          <div className="flex items-center gap-3 rounded-2xl bg-neutral-900 px-3 py-2 text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
            <div className="flex h-6 flex-1 items-center gap-[3px]">
              {liveBars.map((value, index) => (
                <span
                  key={index}
                  className="inline-block w-[3px] rounded-full bg-white/80"
                  style={{ height: `${8 + value * 16}px` }}
                />
              ))}
            </div>
            <span className="w-10 text-xs tabular-nums">
              {Math.floor(recordMs / 1000)}s
            </span>
            <button
              type="button"
              onClick={() => stopRecording(false)}
              className="rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void stopToPreview()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-900"
              aria-label="Arrêter l’enregistrement"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          </div>
        ) : voiceDraft ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(voiceDraft.url)
                setVoiceDraft(null)
              }}
              className="rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
            >
              Annuler
            </button>
            <div className="flex h-10 min-w-0 flex-1 items-center gap-[3px] rounded-xl bg-neutral-100 px-3">
              {voiceDraft.waveform.map((value, index) => (
                <span
                  key={index}
                  className="inline-block w-[3px] rounded-full bg-neutral-500"
                  style={{ height: `${8 + value * 16}px` }}
                />
              ))}
              <span className="ml-2 text-[11px] text-neutral-400 tabular-nums">
                {Math.round(voiceDraft.durationMs / 1000)}s
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleSuggest()}
              disabled={suggesting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
              title="Suggestions IA"
              aria-label="Suggestions IA"
            >
              {suggesting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <AiIcon className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100"
              aria-label="Ajouter une image"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <button
              onClick={() => setEmojiOpen((open) => !open)}
              className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100"
              aria-label="Emojis"
            >
              <Smile className="h-5 w-5" />
            </button>
            {isGroup && (
              <button
                type="button"
                onClick={() => setPollOpen((open) => !open)}
                className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100"
                aria-label="Sondage"
              >
                <BarChart3 className="h-5 w-5" />
              </button>
            )}
            <textarea
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value)
                pingTyping()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              placeholder={editingId ? 'Modifier le message…' : 'Écris un message…'}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl bg-neutral-100 px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSuggest()}
              disabled={suggesting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
              title="Suggestions IA"
              aria-label="Suggestions IA"
            >
              {suggesting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <AiIcon className="h-4 w-4" />
              )}
            </button>
            {text.trim().length === 0 && file === null && editingId === null ? (
              <button
                type="button"
                onClick={() => void startRecording()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
                aria-label="Message vocal"
              >
                <Mic className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={() => void handleSend()}
                disabled={sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
                aria-label="Envoyer"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
            {emojiOpen && (
              <div className="absolute bottom-14 left-12 z-20">
                <EmojiPicker
                  onSelect={(emoji) => {
                    setText((current) => current + emoji)
                    pingTyping()
                  }}
                  onClose={() => setEmojiOpen(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {forwardId && <ForwardModal messageId={forwardId} onClose={() => setForwardId(null)} />}
      {groupOpen && (
        <GroupPanel
          conversationId={conversationId}
          title={title}
          description={conversation.description}
          imageUrl={conversation.imageUrl}
          createdAt={conversation.createdAt}
          members={conversation.members}
          memberRoles={conversation.memberRoles}
          myRole={conversation.myRole}
          meId={meId}
          writePolicy={conversation.writePolicy}
          onClose={() => setGroupOpen(false)}
          onOpenUser={(userId) => {
            setGroupOpen(false)
            onOpenProfile?.(userId)
          }}
        />
      )}
    </div>
  )
}
