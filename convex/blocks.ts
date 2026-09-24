import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  blockStatus,
  blockStatusValidator,
  getBlock,
  publicUserValidator,
  requireUser,
  toPublicUser,
} from './lib'

export const status = query({
  args: { otherUserId: v.id('users') },
  returns: blockStatusValidator,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    return await blockStatus(ctx, me._id, args.otherUserId)
  },
})

export const listBlocked = query({
  args: {},
  returns: v.array(
    v.object({
      blockId: v.id('blocks'),
      user: publicUserValidator,
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const me = await requireUser(ctx)
    const rows = await ctx.db
      .query('blocks')
      .withIndex('by_blocker', (q) => q.eq('blockerId', me._id))
      .collect()
    const result = []
    for (const row of rows) {
      const user = await ctx.db.get(row.blockedId)
      if (user === null) continue
      result.push({
        blockId: row._id,
        user: await toPublicUser(ctx, user),
        createdAt: row.createdAt,
      })
    }
    return result
  },
})

export const blockUser = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    if (args.userId === me._id) throw new Error('Impossible de te bloquer toi-même')
    const other = await ctx.db.get(args.userId)
    if (other === null) throw new Error('Utilisateur introuvable')
    const existing = await getBlock(ctx, me._id, args.userId)
    if (existing !== null) return null
    await ctx.db.insert('blocks', {
      blockerId: me._id,
      blockedId: args.userId,
      createdAt: Date.now(),
    })
    return null
  },
})

export const unblockUser = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const existing = await getBlock(ctx, me._id, args.userId)
    if (existing === null) return null

    if (
      existing.leftoverMessage !== undefined &&
      existing.leftoverConversationId !== undefined
    ) {
      const notes = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q) =>
          q.eq('conversationId', existing.leftoverConversationId!),
        )
        .collect()
      for (const message of notes) {
        if (message.kind !== 'block_note') continue
        if (message.senderId !== args.userId) continue
        const hiddenFor = (message.hiddenFor ?? []).filter((id) => id !== me._id)
        await ctx.db.patch(message._id, { hiddenFor })
      }
    }

    await ctx.db.delete(existing._id)
    return null
  },
})

export const revealLeftover = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const rows = await ctx.db
      .query('blocks')
      .withIndex('by_blocker', (q) => q.eq('blockerId', me._id))
      .collect()
    const block = rows.find(
      (row) =>
        row.leftoverConversationId === args.conversationId &&
        row.leftoverMessage !== undefined,
    )
    if (block === undefined) return null
    const notes = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect()
    for (const message of notes) {
      if (message.kind !== 'block_note') continue
      if (message.senderId !== block.blockedId) continue
      const hiddenFor = (message.hiddenFor ?? []).filter((id) => id !== me._id)
      await ctx.db.patch(message._id, { hiddenFor })
    }
    await ctx.db.patch(block._id, { leftoverRevealedAt: Date.now() })
    return null
  },
})
