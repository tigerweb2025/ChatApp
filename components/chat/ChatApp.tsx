'use client'

import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { MessageCircle } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import CreateGroupModal from './CreateGroupModal'
import NoteSheet from './NoteSheet'
import ProfilePanel from './ProfilePanel'
import ProfileSetup from './ProfileSetup'
import Sidebar from './Sidebar'
import StoryComposer from './StoryComposer'
import StoryViewer from './StoryViewer'
import Thread from './Thread'

export default function ChatApp() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const syncUser = useMutation(api.users.getOrCreateUser)
  const heartbeat = useMutation(api.presence.heartbeat)
  const me = useQuery(api.users.me)
  const conversations = useQuery(api.conversations.listMyConversations)
  const feed = useQuery(api.stories.listFeed)
  const searchParams = useSearchParams()
  const [selectedId, setSelectedId] = useState<Id<'conversations'> | null>(null)
  const [myProfile, setMyProfile] = useState(false)
  const [otherProfile, setOtherProfile] = useState<Id<'users'> | null>(null)
  const [newGroup, setNewGroup] = useState(false)
  const [composer, setComposer] = useState(false)
  const [noteUserId, setNoteUserId] = useState<Id<'users'> | null>(null)
  const [viewerUserId, setViewerUserId] = useState<Id<'users'> | null>(null)
  const [loadStoryId, setLoadStoryId] = useState<Id<'stories'> | null>(
    () => (searchParams.get('story') as Id<'stories'> | null) ?? null,
  )
  const [extraStoryUser, setExtraStoryUser] = useState<Id<'users'> | null>(null)
  const notifiedRef = useRef<string>('')
  const loadedStory = useQuery(
    api.stories.getById,
    loadStoryId ? { storyId: loadStoryId } : 'skip',
  )
  const extraPack = useQuery(
    api.stories.packForUser,
    extraStoryUser ? { userId: extraStoryUser } : 'skip',
  )

  useEffect(() => {
    if (!isAuthenticated) return
    void syncUser()
    void heartbeat()
    const id = window.setInterval(() => {
      void heartbeat()
    }, 25_000)
    return () => window.clearInterval(id)
  }, [heartbeat, isAuthenticated, syncUser])

  useEffect(() => {
    if (conversations === undefined) return
    const key = conversations
      .filter((c) => c._id !== selectedId && (c.unreadCount > 0 || c.unseenPreview !== null))
      .map((c) => `${c._id}:${c.unreadCount}:${c.unseenPreview?.kind ?? ''}:${c.unseenPreview?.at ?? 0}`)
      .join('|')
    if (key.length === 0 || key === notifiedRef.current) {
      notifiedRef.current = key
      return
    }
    if (notifiedRef.current !== '' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const incoming = conversations.find(
        (c) => c._id !== selectedId && (c.unreadCount > 0 || c.unseenPreview !== null),
      )
      if (incoming) {
        const title =
          incoming.kind === 'group'
            ? incoming.title || 'Groupe'
            : incoming.otherUser?.name ?? 'Nouveau message'
        const preview = incoming.unseenPreview
        const body =
          preview?.kind === 'reaction'
            ? `a réagi avec ${preview.emoji ?? ''}`
            : preview?.kind === 'note_like'
              ? 'a aimé votre note'
              : preview?.kind === 'note_reply'
                ? 'a répondu à votre note'
                : incoming.lastMessage?.content || 'Nouveau message'
        new Notification(title, { body })
      }
    }
    notifiedRef.current = key
  }, [conversations, selectedId])

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') void Notification.requestPermission()
  }, [])

  const selected = conversations?.find((c) => c._id === selectedId)
  const viewerPack =
    (viewerUserId && feed
      ? feed.find((pack) => pack.user._id === viewerUserId)
      : undefined) ??
    loadedStory ??
    extraPack ??
    undefined

  function openStory(userId: Id<'users'>, storyId?: Id<'stories'>) {
    const inFeed = feed?.some((pack) => pack.user._id === userId)
    if (inFeed) {
      setLoadStoryId(null)
      setExtraStoryUser(null)
      setViewerUserId(userId)
      return
    }
    setViewerUserId(null)
    if (storyId) {
      setExtraStoryUser(null)
      setLoadStoryId(storyId)
      return
    }
    setLoadStoryId(null)
    setExtraStoryUser(userId)
  }

  if (isLoading || me === undefined) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-sm text-neutral-400">
        Chargement…
      </div>
    )
  }

  if (!isAuthenticated || me === null) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-sm text-neutral-400">
        Connexion…
      </div>
    )
  }

  if (!me.profileCompleted) {
    return <ProfileSetup me={me} />
  }

  return (
    <div className="relative flex h-svh overflow-hidden bg-background">
      <aside
        className={`h-full w-full shrink-0 border-r border-neutral-200 md:w-[340px] ${
          selectedId ? 'hidden md:flex' : 'flex'
        } flex-col`}
      >
        <Sidebar
          selectedId={selectedId}
          onSelect={setSelectedId}
          me={{
            _id: me._id,
            name: me.name,
            imageUrl: me.imageUrl,
            username: me.username,
            note: me.note,
          }}
          onOpenMe={() => setMyProfile(true)}
          onOpenStory={openStory}
          onComposeStory={() => setComposer(true)}
          onOpenNote={setNoteUserId}
        />
      </aside>

      <main className={`min-w-0 flex-1 ${selectedId ? 'flex' : 'hidden md:flex'} flex-col`}>
        {selectedId ? (
          selected ? (
            <Thread
              conversation={selected}
              meId={me._id}
              onBack={() => setSelectedId(null)}
              onOpenStory={(storyId) => {
                setLoadStoryId(storyId)
                setViewerUserId(null)
                setExtraStoryUser(null)
              }}
              onOpenProfile={setOtherProfile}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              Ouverture…
            </div>
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
              <MessageCircle className="h-6 w-6 text-neutral-400" />
            </div>
            <p className="mt-4 text-sm font-medium text-neutral-700">Tes conversations</p>
            <p className="mt-1 max-w-xs text-sm text-neutral-400">
              Choisis un fil à gauche, cherche quelqu’un, ou crée un groupe.
            </p>
          </div>
        )}
      </main>

      {myProfile && (
        <ProfilePanel
          userId={me._id}
          onClose={() => setMyProfile(false)}
          isOwner
          me={me}
          onOpenStory={() => {
            setMyProfile(false)
            openStory(me._id)
          }}
          onComposeStory={() => {
            setMyProfile(false)
            setComposer(true)
          }}
          onNewGroup={() => {
            setMyProfile(false)
            setNewGroup(true)
          }}
          onOpenNote={() => {
            setMyProfile(false)
            setNoteUserId(me._id)
          }}
        />
      )}
      {otherProfile && (
        <ProfilePanel
          userId={otherProfile}
          onClose={() => setOtherProfile(null)}
          onOpenStory={() => {
            const id = otherProfile
            setOtherProfile(null)
            openStory(id)
          }}
          onOpenNote={() => {
            const id = otherProfile
            setOtherProfile(null)
            setNoteUserId(id)
          }}
        />
      )}
      {newGroup && (
        <CreateGroupModal
          onClose={() => setNewGroup(false)}
          onCreated={(id) => {
            setSelectedId(id)
            setNewGroup(false)
          }}
        />
      )}
      {composer && <StoryComposer onClose={() => setComposer(false)} />}
      {noteUserId && (
        <NoteSheet userId={noteUserId} meId={me._id} onClose={() => setNoteUserId(null)} />
      )}
      {viewerPack && viewerPack.stories.length > 0 && me && (
        <StoryViewer
          pack={viewerPack}
          meId={me._id}
          onClose={() => {
            setViewerUserId(null)
            setLoadStoryId(null)
            setExtraStoryUser(null)
          }}
        />
      )}
    </div>
  )
}
