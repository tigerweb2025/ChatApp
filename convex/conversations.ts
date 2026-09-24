import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  adminMembers,
  blockStatus,
  blockStatusValidator,
  conversationUserIds,
  getCurrentUser,
  getMember,
  isGroup,
  lastReadFor,
  otherDmUserId,
  publicUserValidator,
  unseenPreviewValidator,
  requireAdmin,
  requireCompleteProfile,
  requireParticipant,
  requireUser,
  toPublicUser,
} from './lib'

const lastMessageValidator = v.union(
  v.null(),
  v.object({
    content: v.string(),
    createdAt: v.number(),
    senderId: v.id('users'),
    hasImage: v.boolean(),
    hasAudio: v.boolean(),
    kind: v.optional(
      v.union(
        v.literal('text'),
        v.literal('system'),
        v.literal('story_reply'),
        v.literal('block_note'),
        v.literal('note_reply'),
        v.literal('poll'),
      ),
    ),
  }),
)

export const conversationSummaryValidator = v.object({
  _id: v.id('conversations'),
  kind: v.union(v.literal('dm'), v.literal('group')),
  title: v.optional(v.string()),
  lastMessageAt: v.number(),
  unreadCount: v.number(),
  lastMessage: lastMessageValidator,
  otherUser: v.union(v.null(), publicUserValidator),
  members: v.array(publicUserValidator),
  memberCount: v.number(),
  blockStatus: v.union(v.null(), blockStatusValidator),
  imageUrl: v.union(v.string(), v.null()),
  description: v.optional(v.string()),
  writePolicy: v.union(v.literal('all'), v.literal('admins')),
  createdAt: v.number(),
  myRole: v.union(v.literal('admin'), v.literal('member'), v.null()),
  adminIds: v.array(v.id('users')),
  deleteVotes: v.array(v.id('users')),
  memberRoles: v.array(
    v.object({
      userId: v.id('users'),
      role: v.union(v.literal('admin'), v.literal('member')),
    }),
  ),
  otherLastReadAt: v.union(v.number(), v.null()),
  unseenPreview: v.union(v.null(), unseenPreviewValidator),
})

async function visibleLastMessage(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<'conversations'>,
  meId: Id<'users'>,
) {
  const recent = await ctx.db
    .query('messages')
    .withIndex('by_conversation_and_time', (q) => q.eq('conversationId', conversationId))
    .order('desc')
    .take(30)

  return (
    recent.find(
      (message) =>
        message.deletedAt === undefined &&
        !(message.hiddenFor ?? []).includes(meId),
    ) ?? null
  )
}

async function summarize(
  ctx: QueryCtx | MutationCtx,
  conversation: Doc<'conversations'>,
  me: Doc<'users'>,
) {
  const ids = await conversationUserIds(ctx, conversation)
  const members = []
  for (const id of ids) {
    const user = await ctx.db.get(id)
    if (user !== null) members.push(await toPublicUser(ctx, user))
  }
  const others = members.filter((user) => user._id !== me._id)
  const kind = isGroup(conversation) ? ('group' as const) : ('dm' as const)
  const lastMessage = await visibleLastMessage(ctx, conversation._id, me._id)
  const readAt = await lastReadFor(ctx, conversation, me._id)
  const maybeUnread = await ctx.db
    .query('messages')
    .withIndex('by_conversation_and_time', (q) =>
      q.eq('conversationId', conversation._id).gt('createdAt', readAt),
    )
    .take(80)
  const unreadCount = maybeUnread.filter(
    (message) =>
      message.senderId !== me._id &&
      message.deletedAt === undefined &&
      !(message.hiddenFor ?? []).includes(me._id),
  ).length

  let otherUser = others[0] ?? null
  if (kind === 'dm' && otherUser === null) {
    const otherId = otherDmUserId(conversation, me._id)
    if (otherId !== null) {
      const other = await ctx.db.get(otherId)
      if (other !== null) otherUser = await toPublicUser(ctx, other)
    }
  }

  const block =
    kind === 'dm' && otherUser !== null
      ? await blockStatus(ctx, me._id, otherUser._id)
      : null

  return {
    _id: conversation._id,
    kind,
    title: conversation.title,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount,
    lastMessage:
      lastMessage === null
        ? null
        : {
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
            senderId: lastMessage.senderId,
            hasImage: lastMessage.imageId !== undefined,
            hasAudio: lastMessage.audioId !== undefined,
            kind: lastMessage.kind,
          },
    otherUser: kind === 'dm' ? otherUser : null,
    members,
    memberCount: members.length,
    blockStatus: block,
    imageUrl:
      conversation.imageStorageId !== undefined
        ? await ctx.storage.getUrl(conversation.imageStorageId)
        : null,
    description: conversation.description,
    writePolicy: conversation.writePolicy === 'admins' ? ('admins' as const) : ('all' as const),
    createdAt: conversation._creationTime,
    myRole: (await getMember(ctx, conversation._id, me._id))?.role ?? null,
    adminIds: (await adminMembers(ctx, conversation._id)).map((row) => row.userId),
    deleteVotes: conversation.deleteVotes ?? [],
    memberRoles: (await ctx.db
      .query('members')
      .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
      .collect()
    ).map((row) => ({ userId: row.userId, role: row.role })),
    otherLastReadAt:
      kind === 'dm' && otherUser !== null
        ? await lastReadFor(ctx, conversation, otherUser._id)
        : null,
    unseenPreview: (await getMember(ctx, conversation._id, me._id))?.unseenPreview ?? null,
  }
}

async function conversationsFor(
  ctx: QueryCtx | MutationCtx,
  me: Doc<'users'>,
): Promise<Doc<'conversations'>[]> {
  const asOne = await ctx.db
    .query('conversations')
    .withIndex('by_participant_one', (q) => q.eq('participantOneId', me._id))
    .collect()
  const asTwo = await ctx.db
    .query('conversations')
    .withIndex('by_participant_two', (q) => q.eq('participantTwoId', me._id))
    .collect()
  const memberRows = await ctx.db
    .query('members')
    .withIndex('by_user', (q) => q.eq('userId', me._id))
    .collect()

  const map = new Map<string, Doc<'conversations'>>()
  for (const conversation of [...asOne, ...asTwo]) {
    map.set(conversation._id, conversation)
  }
  for (const row of memberRows) {
    if (map.has(row.conversationId)) continue
    const conversation = await ctx.db.get(row.conversationId)
    if (conversation !== null) map.set(conversation._id, conversation)
  }

  return [...map.values()]
    .filter((conversation) => !(conversation.hiddenFor ?? []).includes(me._id))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}

export const listMyConversations = query({
  args: {},
  returns: v.array(conversationSummaryValidator),
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx)
    if (me === null) return []
    const all = await conversationsFor(ctx, me)
    return await Promise.all(all.map((conversation) => summarize(ctx, conversation, me)))
  },
})

export const getConversation = query({
  args: { conversationId: v.id('conversations') },
  returns: v.union(v.null(), conversationSummaryValidator),
  handler: async (ctx, args) => {
    const me = await getCurrentUser(ctx)
    if (me === null) return null
    const conversation = await ctx.db.get(args.conversationId)
    if (conversation === null) return null
    const allowed =
      conversation.participantOneId === me._id ||
      conversation.participantTwoId === me._id ||
      (await ctx.db
        .query('members')
        .withIndex('by_conversation_and_user', (q) =>
          q.eq('conversationId', conversation._id).eq('userId', me._id),
        )
        .first()) !== null
    if (!allowed) return null
    if ((conversation.hiddenFor ?? []).includes(me._id)) return null
    return await summarize(ctx, conversation, me)
  },
})

export const startConversation = mutation({
  args: { otherUserId: v.id('users') },
  returns: v.id('conversations'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    if (args.otherUserId === me._id) {
      throw new Error('Impossible de se parler à soi-même')
    }

    const other = await ctx.db.get(args.otherUserId)
    if (other === null) throw new Error('Utilisateur introuvable')

    const existingAsOne = await ctx.db
      .query('conversations')
      .withIndex('by_participant_one', (q) => q.eq('participantOneId', me._id))
      .filter((q) => q.eq(q.field('participantTwoId'), args.otherUserId))
      .first()

    const existingAsTwo = await ctx.db
      .query('conversations')
      .withIndex('by_participant_two', (q) => q.eq('participantTwoId', me._id))
      .filter((q) => q.eq(q.field('participantOneId'), args.otherUserId))
      .first()

    const existing = existingAsOne ?? existingAsTwo
    if (existing !== null) {
      const hiddenFor = (existing.hiddenFor ?? []).filter((id) => id !== me._id)
      if (hiddenFor.length !== (existing.hiddenFor ?? []).length) {
        await ctx.db.patch(existing._id, { hiddenFor })
      }
      return existing._id
    }

    const blocked = await blockStatus(ctx, me._id, args.otherUserId)
    if (blocked.iBlocked || blocked.theyBlocked) {
      throw new Error('Impossible de démarrer cette conversation')
    }

    const now = Date.now()
    const id = await ctx.db.insert('conversations', {
      kind: 'dm',
      participantOneId: me._id,
      participantTwoId: args.otherUserId,
      lastMessageAt: now,
      createdBy: me._id,
      hiddenFor: [],
    })
    await ctx.db.insert('members', {
      conversationId: id,
      userId: me._id,
      role: 'admin',
      joinedAt: now,
    })
    await ctx.db.insert('members', {
      conversationId: id,
      userId: args.otherUserId,
      role: 'member',
      joinedAt: now,
    })
    return id
  },
})

export const createGroup = mutation({
  args: {
    title: v.string(),
    memberIds: v.array(v.id('users')),
  },
  returns: v.id('conversations'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const title = args.title.trim()
    if (title.length > 40) throw new Error('Le nom du groupe est trop long')

    const unique = [...new Set(args.memberIds.filter((id) => id !== me._id))]
    if (unique.length < 2) {
      throw new Error('Un groupe a besoin d’au moins 2 autres personnes')
    }
    if (unique.length > 20) throw new Error('Maximum 20 membres')

    for (const id of unique) {
      const user = await ctx.db.get(id)
      if (user === null) throw new Error('Utilisateur introuvable')
    }

    const now = Date.now()
    const conversationId = await ctx.db.insert('conversations', {
      kind: 'group',
      title: title.length > 0 ? title : undefined,
      lastMessageAt: now,
      createdBy: me._id,
      hiddenFor: [],
      writePolicy: 'all',
      deleteVotes: [],
    })

    await ctx.db.insert('members', {
      conversationId,
      userId: me._id,
      role: 'admin',
      joinedAt: now,
    })
    for (const userId of unique) {
      await ctx.db.insert('members', {
        conversationId,
        userId,
        role: 'member',
        joinedAt: now,
      })
    }

    return conversationId
  },
})

export const hideConversation = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    const hiddenFor = [...new Set([...(conversation.hiddenFor ?? []), me._id])]
    await ctx.db.patch(conversation._id, { hiddenFor })
    return null
  },
})

export const markAsRead = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    const now = Date.now()

    const member = await ctx.db
      .query('members')
      .withIndex('by_conversation_and_user', (q) =>
        q.eq('conversationId', conversation._id).eq('userId', me._id),
      )
      .first()
    if (member !== null) {
      await ctx.db.patch(member._id, { lastReadAt: now, unseenPreview: undefined })
    }

    if (conversation.participantOneId === me._id) {
      await ctx.db.patch(conversation._id, { participantOneLastReadAt: now })
    } else if (conversation.participantTwoId === me._id) {
      await ctx.db.patch(conversation._id, { participantTwoLastReadAt: now })
    }
    return null
  },
})

async function wipeGroup(ctx: MutationCtx, conversationId: Id<'conversations'>) {
  const messages = await ctx.db
    .query('messages')
    .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
    .collect()
  for (const message of messages) await ctx.db.delete(message._id)
  const members = await ctx.db
    .query('members')
    .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
    .collect()
  for (const member of members) await ctx.db.delete(member._id)
  await ctx.db.delete(conversationId)
}

export const updateGroup = mutation({
  args: {
    conversationId: v.id('conversations'),
    title: v.string(),
    description: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    if (!isGroup(conversation)) throw new Error('Ce n’est pas un groupe')
    await requireAdmin(ctx, conversation, me._id)
    const title = args.title.trim()
    if (title.length < 1 || title.length > 40) throw new Error('Nom du groupe : 1 à 40 caractères')
    const description = args.description.trim()
    if (description.length > 200) throw new Error('Description trop longue')
    await ctx.db.patch(conversation._id, {
      title,
      description: description.length > 0 ? description : undefined,
    })
    return null
  },
})

export const setGroupAvatar = mutation({
  args: {
    conversationId: v.id('conversations'),
    storageId: v.id('_storage'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    if (!isGroup(conversation)) throw new Error('Ce n’est pas un groupe')
    await requireAdmin(ctx, conversation, me._id)
    await ctx.db.patch(conversation._id, { imageStorageId: args.storageId })
    return null
  },
})

export const setWritePolicy = mutation({
  args: {
    conversationId: v.id('conversations'),
    writePolicy: v.union(v.literal('all'), v.literal('admins')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    if (!isGroup(conversation)) throw new Error('Ce n’est pas un groupe')
    await requireAdmin(ctx, conversation, me._id)
    await ctx.db.patch(conversation._id, { writePolicy: args.writePolicy })
    return null
  },
})

export const promoteAdmin = mutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    if (!isGroup(conversation)) throw new Error('Ce n’est pas un groupe')
    await requireAdmin(ctx, conversation, me._id)
    const target = await getMember(ctx, conversation._id, args.userId)
    if (target === null) throw new Error('Membre introuvable')
    if (target.role === 'admin') return null
    await ctx.db.patch(target._id, { role: 'admin' })
    return null
  },
})

export const removeMember = mutation({
  args: {
    conversationId: v.id('conversations'),
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    if (!isGroup(conversation)) throw new Error('Ce n’est pas un groupe')
    await requireAdmin(ctx, conversation, me._id)
    if (args.userId === me._id) throw new Error('Utilise Quitter pour partir')
    const target = await getMember(ctx, conversation._id, args.userId)
    if (target === null) throw new Error('Membre introuvable')
    await ctx.db.delete(target._id)
    return null
  },
})

export const leaveGroup = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    if (!isGroup(conversation)) throw new Error('Ce n’est pas un groupe')
    const mine = await getMember(ctx, conversation._id, me._id)
    if (mine === null) throw new Error('Tu n’es pas membre')
    await ctx.db.delete(mine._id)
    return null
  },
})

export const deleteGroup = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await requireParticipant(ctx, args.conversationId, me._id)
    if (!isGroup(conversation)) throw new Error('Ce n’est pas un groupe')
    await requireAdmin(ctx, conversation, me._id)
    await wipeGroup(ctx, conversation._id)
    return null
  },
})


