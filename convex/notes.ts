import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  DAY_MS,
  findDirectConversation,
  getBlock,
  getCurrentUser,
  partnerUserIds,
  publicUserValidator,
  requireCompleteProfile,
  requireUser,
  setUnseenPreview,
  toPublicUser,
} from './lib'

const noteCard = v.object({
  user: publicUserValidator,
  note: v.string(),
  noteAt: v.number(),
  likeCount: v.number(),
  likedByMe: v.boolean(),
  replyCount: v.number(),
})

export const listFeed = query({
  args: {},
  returns: v.array(noteCard),
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx)
    if (me === null) return []
    const now = Date.now()
    const partners = await partnerUserIds(ctx, me._id)
    const ids = [me._id, ...[...partners].map((id) => id as typeof me._id)]
    const feed = []
    const seen = new Set<string>()
    for (const userId of ids) {
      if (seen.has(userId)) continue
      seen.add(userId)
      const user = await ctx.db.get(userId)
      if (user === null) continue
      if (user.note === undefined || user.noteAt === undefined) continue
      if (now - user.noteAt >= DAY_MS) continue
      if (user._id !== me._id) {
        if ((await getBlock(ctx, user._id, me._id)) !== null) continue
        if ((await getBlock(ctx, me._id, user._id)) !== null) continue
      }
      const likes = await ctx.db
        .query('noteLikes')
        .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
        .collect()
      const replies = await ctx.db
        .query('noteReplies')
        .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
        .collect()
      feed.push({
        user: await toPublicUser(ctx, user),
        note: user.note,
        noteAt: user.noteAt,
        likeCount: likes.length,
        likedByMe: likes.some((like) => like.likerId === me._id),
        replyCount: replies.length,
      })
    }
    feed.sort((a, b) => b.noteAt - a.noteAt)
    return feed
  },
})

export const getOne = query({
  args: { userId: v.id('users') },
  returns: v.union(
    v.null(),
    v.object({
      user: publicUserValidator,
      note: v.string(),
      noteAt: v.number(),
      likeCount: v.number(),
      likedByMe: v.boolean(),
      likers: v.array(publicUserValidator),
      replies: v.array(
        v.object({
          _id: v.id('noteReplies'),
          author: publicUserValidator,
          content: v.string(),
          createdAt: v.number(),
          likeCount: v.number(),
          likedByMe: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const me = await getCurrentUser(ctx)
    if (me === null) return null
    const user = await ctx.db.get(args.userId)
    if (user === null || user.note === undefined || user.noteAt === undefined) return null
    if (Date.now() - user.noteAt >= DAY_MS) return null
    const likes = await ctx.db
      .query('noteLikes')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .collect()
    const replyRows = await ctx.db
      .query('noteReplies')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .collect()
    const likers = []
    for (const like of likes) {
      const liker = await ctx.db.get(like.likerId)
      if (liker === null) continue
      likers.push(await toPublicUser(ctx, liker))
    }
    const replies = []
    for (const row of replyRows.sort((a, b) => a.createdAt - b.createdAt)) {
      const author = await ctx.db.get(row.authorId)
      if (author === null) continue
      const replyLikes = await ctx.db
        .query('noteReplyLikes')
        .withIndex('by_reply', (q) => q.eq('replyId', row._id))
        .collect()
      replies.push({
        _id: row._id,
        author: await toPublicUser(ctx, author),
        content: row.content,
        createdAt: row.createdAt,
        likeCount: replyLikes.length,
        likedByMe: replyLikes.some((like) => like.likerId === me._id),
      })
    }
    return {
      user: await toPublicUser(ctx, user),
      note: user.note,
      noteAt: user.noteAt,
      likeCount: likes.length,
      likedByMe: likes.some((like) => like.likerId === me._id),
      likers,
      replies,
    }
  },
})

export const toggleLike = mutation({
  args: { ownerId: v.id('users') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const owner = await ctx.db.get(args.ownerId)
    if (owner === null || owner.note === undefined) throw new Error('Note introuvable')
    const existing = await ctx.db
      .query('noteLikes')
      .withIndex('by_pair', (q) => q.eq('ownerId', args.ownerId).eq('likerId', me._id))
      .first()
    if (existing !== null) {
      await ctx.db.delete(existing._id)
      return false
    }
    const now = Date.now()
    await ctx.db.insert('noteLikes', {
      ownerId: args.ownerId,
      likerId: me._id,
      createdAt: now,
    })
    if (args.ownerId !== me._id) {
      const conversation = await findDirectConversation(ctx, me._id, args.ownerId)
      if (conversation !== null) {
        await setUnseenPreview(ctx, conversation._id, args.ownerId, {
          kind: 'note_like',
          fromName: me.name,
          at: now,
        })
      }
    }
    return true
  },
})

export const toggleReplyLike = mutation({
  args: { replyId: v.id('noteReplies') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const reply = await ctx.db.get(args.replyId)
    if (reply === null) throw new Error('Commentaire introuvable')
    const existing = await ctx.db
      .query('noteReplyLikes')
      .withIndex('by_pair', (q) => q.eq('replyId', args.replyId).eq('likerId', me._id))
      .first()
    if (existing !== null) {
      await ctx.db.delete(existing._id)
      return false
    }
    await ctx.db.insert('noteReplyLikes', {
      replyId: args.replyId,
      likerId: me._id,
      createdAt: Date.now(),
    })
    return true
  },
})

export const reply = mutation({
  args: {
    ownerId: v.id('users'),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const owner = await ctx.db.get(args.ownerId)
    if (owner === null || owner.note === undefined) throw new Error('Note introuvable')
    const content = args.content.trim()
    if (content.length === 0) throw new Error('Message vide')
    if (content.length > 280) throw new Error('Réponse trop longue')
    const now = Date.now()
    await ctx.db.insert('noteReplies', {
      ownerId: args.ownerId,
      authorId: me._id,
      content,
      createdAt: now,
    })

    if (args.ownerId === me._id) return null

    const existingAsOne = await ctx.db
      .query('conversations')
      .withIndex('by_participant_one', (q) => q.eq('participantOneId', me._id))
      .filter((q) => q.eq(q.field('participantTwoId'), args.ownerId))
      .first()
    const existingAsTwo = await ctx.db
      .query('conversations')
      .withIndex('by_participant_two', (q) => q.eq('participantTwoId', me._id))
      .filter((q) => q.eq(q.field('participantOneId'), args.ownerId))
      .first()
    let conversationId = (existingAsOne ?? existingAsTwo)?._id
    if (conversationId === undefined) {
      conversationId = await ctx.db.insert('conversations', {
        kind: 'dm',
        participantOneId: me._id,
        participantTwoId: args.ownerId,
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
        userId: args.ownerId,
        role: 'member',
        joinedAt: now,
      })
    }
    await ctx.db.insert('messages', {
      conversationId,
      senderId: me._id,
      content,
      createdAt: now,
      kind: 'note_reply',
      noteText: owner.note,
    })
    await ctx.db.patch(conversationId, { lastMessageAt: now, hiddenFor: [] })
    if (args.ownerId !== me._id) {
      await setUnseenPreview(ctx, conversationId, args.ownerId, {
        kind: 'note_reply',
        fromName: me.name,
        at: now,
      })
    }
    return null
  },
})
