import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import { internalQuery, mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import {
  assertCanWrite,
  blockStatus,
  clearTyping,
  getBlock,
  isGroup,
  otherDmUserId,
  requireCompleteProfile,
  requireParticipant,
  requireUser,
  setUnseenPreview,
  touchConversation,
} from './lib'

const reactionValidator = v.object({
  emoji: v.string(),
  userId: v.id('users'),
})

const messageDoc = v.object({
  _id: v.id('messages'),
  _creationTime: v.number(),
  conversationId: v.id('conversations'),
  senderId: v.id('users'),
  content: v.string(),
  createdAt: v.number(),
  imageId: v.optional(v.id('_storage')),
  imageUrl: v.union(v.string(), v.null()),
  audioId: v.optional(v.id('_storage')),
  audioUrl: v.union(v.string(), v.null()),
  audioDurationMs: v.optional(v.number()),
  waveform: v.optional(v.array(v.number())),
  editedAt: v.optional(v.number()),
  forwarded: v.boolean(),
  reactions: v.array(reactionValidator),
  kind: v.union(
    v.literal('text'),
    v.literal('system'),
    v.literal('story_reply'),
    v.literal('block_note'),
    v.literal('note_reply'),
    v.literal('poll'),
  ),
  storyId: v.optional(v.id('stories')),
  storyImageUrl: v.union(v.string(), v.null()),
  storyText: v.optional(v.string()),
  storyBackground: v.optional(v.string()),
  noteText: v.optional(v.string()),
  replyTo: v.union(
    v.null(),
    v.object({
      _id: v.id('messages'),
      content: v.string(),
      senderId: v.id('users'),
      hasAudio: v.boolean(),
      hasImage: v.boolean(),
      audioDurationMs: v.optional(v.number()),
    }),
  ),
  pollOptions: v.optional(v.array(v.string())),
  pollVotes: v.optional(
    v.array(
      v.object({
        userId: v.id('users'),
        optionIndex: v.number(),
      }),
    ),
  ),
})

async function hydrateMessage(ctx: QueryCtx, message: Doc<'messages'>) {
  return {
    _id: message._id,
    _creationTime: message._creationTime,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    createdAt: message.createdAt,
    imageId: message.imageId,
    imageUrl:
      message.imageId !== undefined ? await ctx.storage.getUrl(message.imageId) : null,
    audioId: message.audioId,
    audioUrl:
      message.audioId !== undefined ? await ctx.storage.getUrl(message.audioId) : null,
    audioDurationMs: message.audioDurationMs,
    waveform: message.waveform,
    editedAt: message.editedAt,
    forwarded: message.forwardedFrom !== undefined,
    reactions: message.reactions ?? [],
    kind: message.kind ?? 'text',
    replyTo:
      message.replyToId !== undefined
        ? await (async () => {
            const quoted = await ctx.db.get(message.replyToId!)
            if (quoted === null) {
              return {
                _id: message.replyToId!,
                content: 'Message indisponible',
                senderId: message.senderId,
                hasAudio: false,
                hasImage: false,
              }
            }
            return {
              _id: quoted._id,
              content: quoted.content,
              senderId: quoted.senderId,
              hasAudio: quoted.audioId !== undefined,
              hasImage: quoted.imageId !== undefined,
              audioDurationMs: quoted.audioDurationMs,
            }
          })()
        : null,
    noteText: message.noteText,
    pollOptions: message.pollOptions,
    pollVotes: message.pollVotes,
    storyId: message.storyId,
    storyImageUrl:
      message.storyId !== undefined
        ? await (async () => {
            const story = await ctx.db.get(message.storyId!)
            if (story === null) return null
            if (story.imageId !== undefined) return await ctx.storage.getUrl(story.imageId)
            if (story.videoId !== undefined) return await ctx.storage.getUrl(story.videoId)
            return null
          })()
        : null,
    storyText:
      message.storyId !== undefined
        ? ((await ctx.db.get(message.storyId))?.text ?? undefined)
        : undefined,
    storyBackground:
      message.storyId !== undefined
        ? ((await ctx.db.get(message.storyId))?.background ?? undefined)
        : undefined,
  }
}

async function assertCanSendMedia(
  ctx: Parameters<typeof blockStatus>[0],
  conversation: Doc<'conversations'>,
  meId: Doc<'users'>['_id'],
) {
  if (isGroup(conversation)) return
  const otherId = otherDmUserId(conversation, meId)
  if (otherId === null) return
  const blocked = await blockStatus(ctx, meId, otherId)
  if (blocked.iBlocked || blocked.theyBlocked) {
    throw new Error('Envoi impossible pendant un blocage')
  }
}

function isVisible(message: Doc<'messages'>, userId: Doc<'users'>['_id']) {
  if (message.deletedAt !== undefined) return false
  return !(message.hiddenFor ?? []).includes(userId)
}

export const listMessages = query({
  args: {
    conversationId: v.id('conversations'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageDoc),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    await requireParticipant(ctx, args.conversationId, me._id)

    const result = await ctx.db
      .query('messages')
      .withIndex('by_conversation_and_time', (q) =>
        q.eq('conversationId', args.conversationId),
      )
      .order('desc')
      .paginate(args.paginationOpts)

    const page = []
    for (const message of result.page) {
      if (!isVisible(message, me._id)) continue
      page.push(await hydrateMessage(ctx, message))
    }

    return { ...result, page }
  },
})

export const sendMessage = mutation({
  args: {
    conversationId: v.id('conversations'),
    content: v.string(),
    replyToId: v.optional(v.id('messages')),
  },
  returns: v.id('messages'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    await assertCanWrite(ctx, conversation, me._id)

    const content = args.content.trim()
    if (content.length === 0) throw new Error('Message vide')

    if (!isGroup(conversation)) {
      const otherId = otherDmUserId(conversation, me._id)
      if (otherId !== null) {
        const blocked = await blockStatus(ctx, me._id, otherId)
        if (blocked.iBlocked) {
          throw new Error('Tu as bloqué cet utilisateur')
        }
        if (blocked.theyBlocked) {
          if (!blocked.leftoverAvailable) {
            throw new Error('Tu as déjà envoyé ton unique message')
          }
          if (content.length > 50) {
            throw new Error('50 caractères maximum après un blocage')
          }
          const theirs = await getBlock(ctx, otherId, me._id)
          if (theirs !== null) {
            await ctx.db.patch(theirs._id, {
              leftoverMessage: content,
              leftoverSentAt: Date.now(),
              leftoverConversationId: conversation._id,
            })
          }
          const now = Date.now()
          const id = await ctx.db.insert('messages', {
            conversationId: args.conversationId,
            senderId: me._id,
            content,
            createdAt: now,
            kind: 'block_note',
            hiddenFor: [otherId],
          })
          await touchConversation(ctx, args.conversationId, now)
          await clearTyping(ctx, args.conversationId, me._id)
          return id
        }
      }
    }

    if (content.length > 4000) throw new Error('Message trop long')

    let replyToId = args.replyToId
    if (replyToId !== undefined) {
      const quoted = await ctx.db.get(replyToId)
      if (quoted === null || quoted.kind === 'block_note') replyToId = undefined
    }

    const now = Date.now()
    const id = await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      senderId: me._id,
      content,
      createdAt: now,
      kind: 'text',
      replyToId,
    })

    await touchConversation(ctx, args.conversationId, now)
    await clearTyping(ctx, args.conversationId, me._id)
    return id
  },
})

export const sendStoryReply = mutation({
  args: {
    storyId: v.id('stories'),
    content: v.string(),
  },
  returns: v.id('messages'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const story = await ctx.db.get(args.storyId)
    if (story === null) throw new Error('Story introuvable')
    if (story.userId === me._id) throw new Error('Tu ne peux pas te répondre à toi-même')
    const content = args.content.trim()
    if (content.length === 0) throw new Error('Message vide')
    if (content.length > 4000) throw new Error('Message trop long')

    const blocked = await blockStatus(ctx, me._id, story.userId)
    if (blocked.iBlocked || blocked.theyBlocked) {
      throw new Error('Impossible de répondre à cette story')
    }

    const existingAsOne = await ctx.db
      .query('conversations')
      .withIndex('by_participant_one', (q) => q.eq('participantOneId', me._id))
      .filter((q) => q.eq(q.field('participantTwoId'), story.userId))
      .first()
    const existingAsTwo = await ctx.db
      .query('conversations')
      .withIndex('by_participant_two', (q) => q.eq('participantTwoId', me._id))
      .filter((q) => q.eq(q.field('participantOneId'), story.userId))
      .first()
    let conversationId = (existingAsOne ?? existingAsTwo)?._id
    const now = Date.now()
    if (conversationId === undefined) {
      conversationId = await ctx.db.insert('conversations', {
        kind: 'dm',
        participantOneId: me._id,
        participantTwoId: story.userId,
        lastMessageAt: now,
        createdBy: me._id,
        hiddenFor: [],
      })
      await ctx.db.insert('members', {
        conversationId,
        userId: me._id,
        role: 'admin',
        joinedAt: now,
      })
      await ctx.db.insert('members', {
        conversationId,
        userId: story.userId,
        role: 'member',
        joinedAt: now,
      })
    }

    const id = await ctx.db.insert('messages', {
      conversationId,
      senderId: me._id,
      content,
      createdAt: now,
      kind: 'story_reply',
      storyId: args.storyId,
    })
    await touchConversation(ctx, conversationId, now)
    return id
  },
})

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireCompleteProfile(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const sendImage = mutation({
  args: {
    conversationId: v.id('conversations'),
    storageId: v.id('_storage'),
    caption: v.optional(v.string()),
    replyToId: v.optional(v.id('messages')),
  },
  returns: v.id('messages'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    await assertCanSendMedia(ctx, conversation, me._id)
    await assertCanWrite(ctx, conversation, me._id)

    const caption = args.caption?.trim() ?? ''
    const now = Date.now()
    const id = await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      senderId: me._id,
      content: caption,
      createdAt: now,
      imageId: args.storageId,
      replyToId: args.replyToId,
    })

    await touchConversation(ctx, args.conversationId, now)
    await clearTyping(ctx, args.conversationId, me._id)
    return id
  },
})

export const sendAudio = mutation({
  args: {
    conversationId: v.id('conversations'),
    storageId: v.id('_storage'),
    durationMs: v.number(),
    waveform: v.array(v.number()),
    replyToId: v.optional(v.id('messages')),
  },
  returns: v.id('messages'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    await assertCanSendMedia(ctx, conversation, me._id)
    await assertCanWrite(ctx, conversation, me._id)

    if (args.durationMs < 400 || args.durationMs > 60_000) {
      throw new Error('Le vocal doit durer entre 1s et 60s')
    }
    const waveform = args.waveform.slice(0, 40).map((n) => Math.max(0, Math.min(1, n)))
    if (waveform.length < 8) throw new Error('Vocal invalide')

    const now = Date.now()
    const id = await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      senderId: me._id,
      content: '',
      createdAt: now,
      audioId: args.storageId,
      audioDurationMs: Math.round(args.durationMs),
      waveform,
      replyToId: args.replyToId,
    })

    await touchConversation(ctx, args.conversationId, now)
    await clearTyping(ctx, args.conversationId, me._id)
    return id
  },
})

export const editMessage = mutation({
  args: {
    messageId: v.id('messages'),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const message = await ctx.db.get(args.messageId)
    if (message === null) throw new Error('Message introuvable')
    await requireParticipant(ctx, message.conversationId, me._id)
    if (message.senderId !== me._id) throw new Error('Tu ne peux modifier que tes messages')
    if (message.deletedAt !== undefined) throw new Error('Message retiré')
    if (message.audioId !== undefined) throw new Error('Un vocal ne peut pas être modifié')

    const content = args.content.trim()
    if (content.length === 0) throw new Error('Message vide')
    if (content.length > 4000) throw new Error('Message trop long')

    await ctx.db.patch(message._id, { content, editedAt: Date.now() })
    return null
  },
})

export const unsendMessage = mutation({
  args: { messageId: v.id('messages') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const message = await ctx.db.get(args.messageId)
    if (message === null) throw new Error('Message introuvable')
    await requireParticipant(ctx, message.conversationId, me._id)
    if (message.senderId !== me._id) throw new Error('Tu ne peux retirer que tes messages')
    await ctx.db.patch(message._id, {
      deletedAt: Date.now(),
      content: '',
      reactions: [],
    })
    return null
  },
})

export const deleteForMe = mutation({
  args: { messageId: v.id('messages') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const message = await ctx.db.get(args.messageId)
    if (message === null) throw new Error('Message introuvable')
    await requireParticipant(ctx, message.conversationId, me._id)
    const hiddenFor = [...new Set([...(message.hiddenFor ?? []), me._id])]
    await ctx.db.patch(message._id, { hiddenFor })
    return null
  },
})

export const forwardMessage = mutation({
  args: {
    messageId: v.id('messages'),
    targetConversationId: v.id('conversations'),
  },
  returns: v.id('messages'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const message = await ctx.db.get(args.messageId)
    if (message === null) throw new Error('Message introuvable')
    await requireParticipant(ctx, message.conversationId, me._id)
    await requireParticipant(ctx, args.targetConversationId, me._id)
    if (!isVisible(message, me._id)) throw new Error('Message introuvable')

    const now = Date.now()
    const id = await ctx.db.insert('messages', {
      conversationId: args.targetConversationId,
      senderId: me._id,
      content: message.content,
      createdAt: now,
      imageId: message.imageId,
      audioId: message.audioId,
      audioDurationMs: message.audioDurationMs,
      waveform: message.waveform,
      forwardedFrom: message._id,
    })
    await touchConversation(ctx, args.targetConversationId, now)
    return id
  },
})

export const toggleReaction = mutation({
  args: {
    messageId: v.id('messages'),
    emoji: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const message = await ctx.db.get(args.messageId)
    if (message === null) throw new Error('Message introuvable')
    await requireParticipant(ctx, message.conversationId, me._id)
    if (!isVisible(message, me._id)) throw new Error('Message introuvable')

    const emoji = args.emoji.trim()
    if (emoji.length === 0 || emoji.length > 16) throw new Error('Emoji invalide')

    const current = message.reactions ?? []
    const existing = current.find((reaction) => reaction.userId === me._id)
    const adding = existing === undefined || existing.emoji !== emoji
    let next = current.filter((reaction) => reaction.userId !== me._id)
    if (adding) {
      next = [...next, { emoji, userId: me._id }]
    }
    await ctx.db.patch(message._id, { reactions: next })

    if (
      adding &&
      message.senderId !== me._id &&
      message.kind !== 'block_note'
    ) {
      const conversation = await ctx.db.get(message.conversationId)
      if (conversation !== null && !isGroup(conversation)) {
        const otherId = otherDmUserId(conversation, me._id)
        if (otherId !== null) {
          const blocked = await blockStatus(ctx, me._id, otherId)
          if (!blocked.iBlocked && !blocked.theyBlocked) {
            await setUnseenPreview(ctx, conversation._id, message.senderId, {
              kind: 'reaction',
              emoji,
              fromName: me.name,
              at: Date.now(),
            })
          }
        }
      } else if (conversation !== null) {
        await setUnseenPreview(ctx, conversation._id, message.senderId, {
          kind: 'reaction',
          emoji,
          fromName: me.name,
          at: Date.now(),
        })
      }
    }
    return null
  },
})

export const sendPoll = mutation({
  args: {
    conversationId: v.id('conversations'),
    question: v.string(),
    options: v.array(v.string()),
  },
  returns: v.id('messages'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    if (!isGroup(conversation)) throw new Error('Les sondages sont réservés aux groupes')
    await assertCanWrite(ctx, conversation, me._id)
    const question = args.question.trim()
    if (question.length === 0) throw new Error('Question vide')
    const options = args.options.map((option) => option.trim()).filter((option) => option.length > 0)
    if (options.length < 2 || options.length > 6) {
      throw new Error('Le sondage doit avoir entre 2 et 6 choix')
    }
    const now = Date.now()
    const id = await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      senderId: me._id,
      content: question,
      createdAt: now,
      kind: 'poll',
      pollOptions: options,
      pollVotes: [],
    })
    await touchConversation(ctx, args.conversationId, now)
    return id
  },
})

export const votePoll = mutation({
  args: {
    messageId: v.id('messages'),
    optionIndex: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const message = await ctx.db.get(args.messageId)
    if (message === null || message.kind !== 'poll') throw new Error('Sondage introuvable')
    await requireParticipant(ctx, message.conversationId, me._id)
    const options = message.pollOptions ?? []
    if (args.optionIndex < 0 || args.optionIndex >= options.length) {
      throw new Error('Choix invalide')
    }
    const current = message.pollVotes ?? []
    const withoutMe = current.filter((vote) => vote.userId !== me._id)
    await ctx.db.patch(message._id, {
      pollVotes: [...withoutMe, { userId: me._id, optionIndex: args.optionIndex }],
    })
    return null
  },
})

function messageTextForAi(message: {
  content: string
  audioId?: unknown
  imageId?: unknown
}): string {
  if (message.content.length > 0) return message.content
  if (message.audioId !== undefined) return '[message vocal]'
  if (message.imageId !== undefined) return '[image]'
  return ''
}

export const recentForAi = internalQuery({
  args: { conversationId: v.id('conversations') },
  returns: v.object({
    mine: v.array(v.string()),
    theirs: v.array(v.string()),
    thread: v.array(
      v.object({
        sender: v.union(v.literal('me'), v.literal('other')),
        content: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    await requireParticipant(ctx, args.conversationId, me._id)

    const recent = await ctx.db
      .query('messages')
      .withIndex('by_conversation_and_time', (q) =>
        q.eq('conversationId', args.conversationId),
      )
      .order('desc')
      .take(80)

    const visible = recent.filter((message) => isVisible(message, me._id))
    const mine: string[] = []
    const theirs: string[] = []
    const thread: { sender: 'me' | 'other'; content: string }[] = []

    for (const message of visible) {
      const content = messageTextForAi(message)
      if (content.length === 0) continue
      const mineMsg = message.senderId === me._id
      if (mineMsg) {
        if (mine.length < 5) mine.push(content)
      } else if (theirs.length < 10) {
        theirs.push(content)
      }
      if (thread.length < 12) {
        thread.push({ sender: mineMsg ? 'me' : 'other', content })
      }
    }

    return {
      mine: mine.reverse(),
      theirs: theirs.reverse(),
      thread: thread.reverse(),
    }
  },
})
