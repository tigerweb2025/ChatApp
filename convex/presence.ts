import { mutation } from './_generated/server'
import { v } from 'convex/values'
import { requireUser } from './lib'

export const heartbeat = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const me = await requireUser(ctx)
    await ctx.db.patch(me._id, { lastSeenAt: Date.now() })
    return null
  },
})
