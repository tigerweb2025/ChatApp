import { internalMutation, mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { isParticipant, requireUser } from './lib'

const TYPING_TTL_MS = 4000

export const setTyping = mutation({
  args: {
    conversationId: v.id('conversations'),
    isTyping: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (conversation === null) return null
    if (!(await isParticipant(ctx, conversation, me._id))) return null

    const existing = await ctx.db
      .query('typing')
      .withIndex('by_conversation_and_user', (q) =>
        q.eq('conversationId', args.conversationId).eq('userId', me._id),
      )
      .first()

    if (!args.isTyping) {
      if (existing !== null) await ctx.db.delete(existing._id)
      return null
    }

    if (existing !== null) {
      await ctx.db.patch(existing._id, { updatedAt: Date.now() })
    } else {
      await ctx.db.insert('typing', {
        conversationId: args.conversationId,
        userId: me._id,
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const getTyping = query({
  args: { conversationId: v.id('conversations') },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (conversation === null) return []
    if (!(await isParticipant(ctx, conversation, me._id))) return []

    const cutoff = Date.now() - TYPING_TTL_MS
    const rows = await ctx.db
      .query('typing')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect()

    const names: string[] = []
    for (const row of rows) {
      if (row.userId === me._id || row.updatedAt < cutoff) continue
      const user = await ctx.db.get(row.userId)
      if (user !== null) names.push(user.name)
    }
    return names
  },
})

export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 10_000
    const stale = await ctx.db
      .query('typing')
      .withIndex('by_updatedAt', (q) => q.lt('updatedAt', cutoff))
      .collect()
    for (const row of stale) {
      await ctx.db.delete(row._id)
    }
    return null
  },
})
