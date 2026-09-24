import { internalMutation, mutation, query } from './_generated/server'
import { v } from 'convex/values'
import {
  DAY_MS,
  getBlock,
  getCurrentUser,
  partnerUserIds,
  publicUserValidator,
  requireCompleteProfile,
  requireUser,
  toPublicUser,
} from './lib'
import type { Id } from './_generated/dataModel'

const storyItem = v.object({
  _id: v.id('stories'),
  imageUrl: v.union(v.string(), v.null()),
  videoUrl: v.union(v.string(), v.null()),
  text: v.optional(v.string()),
  background: v.optional(v.string()),
  createdAt: v.number(),
  caption: v.optional(v.string()),
  viewed: v.boolean(),
  likedByMe: v.boolean(),
})

export const listFeed = query({
  args: {},
  returns: v.array(
    v.object({
      user: publicUserValidator,
      stories: v.array(storyItem),
      hasUnseen: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx)
    if (me === null) return []
    const now = Date.now()
    const all = await ctx.db.query('stories').order('desc').take(200)
    const byUser = new Map<string, typeof all>()
    for (const story of all) {
      if (story.expiresAt <= now) continue
      const list = byUser.get(story.userId) ?? []
      list.push(story)
      byUser.set(story.userId, list)
    }

    const partners = await partnerUserIds(ctx, me._id)
    const orderedIds: Id<'users'>[] = []
    if (byUser.has(me._id)) orderedIds.push(me._id)
    for (const userId of byUser.keys()) {
      if (userId === me._id) continue
      if (!partners.has(userId)) continue
      orderedIds.push(userId as Id<'users'>)
    }

    const feed = []
    for (const userId of orderedIds) {
      const user = await ctx.db.get(userId)
      if (user === null) continue
      if (userId !== me._id) {
        if ((await getBlock(ctx, userId, me._id)) !== null) continue
        if ((await getBlock(ctx, me._id, userId)) !== null) continue
      }
      const stories = byUser.get(userId) ?? []
      stories.sort((a, b) => a.createdAt - b.createdAt)
      const items = []
      let hasUnseen = false
      for (const story of stories) {
        const view = await ctx.db
          .query('storyViews')
          .withIndex('by_story_and_viewer', (q) =>
            q.eq('storyId', story._id).eq('viewerId', me._id),
          )
          .first()
        const viewed = view !== null
        if (!viewed && userId !== me._id) hasUnseen = true
        items.push({
          _id: story._id,
          imageUrl:
            story.imageId !== undefined ? await ctx.storage.getUrl(story.imageId) : null,
          videoUrl:
            story.videoId !== undefined ? await ctx.storage.getUrl(story.videoId) : null,
          text: story.text,
          background: story.background,
          createdAt: story.createdAt,
          caption: story.caption,
          viewed,
          likedByMe: view?.liked === true,
        })
      }
      feed.push({
        user: await toPublicUser(ctx, user),
        stories: items,
        hasUnseen,
      })
    }

    feed.sort((a, b) => {
      if (a.user._id === me._id) return -1
      if (b.user._id === me._id) return 1
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1
      return 0
    })
    return feed
  },
})

export const getById = query({
  args: { storyId: v.id('stories') },
  returns: v.union(
    v.null(),
    v.object({
      user: publicUserValidator,
      stories: v.array(storyItem),
      startIndex: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const me = await getCurrentUser(ctx)
    if (me === null) return null
    const story = await ctx.db.get(args.storyId)
    if (story === null || story.expiresAt <= Date.now()) return null
    if (story.userId !== me._id) {
      if ((await getBlock(ctx, story.userId, me._id)) !== null) return null
      if ((await getBlock(ctx, me._id, story.userId)) !== null) return null
    }
    const siblings = await ctx.db
      .query('stories')
      .withIndex('by_user', (q) => q.eq('userId', story.userId))
      .collect()
    const active = siblings
      .filter((item) => item.expiresAt > Date.now())
      .sort((a, b) => a.createdAt - b.createdAt)
    const user = await ctx.db.get(story.userId)
    if (user === null) return null
    const items = []
    let startIndex = 0
    for (const [index, item] of active.entries()) {
      if (item._id === story._id) startIndex = index
      const view = await ctx.db
        .query('storyViews')
        .withIndex('by_story_and_viewer', (q) =>
          q.eq('storyId', item._id).eq('viewerId', me._id),
        )
        .first()
      items.push({
        _id: item._id,
        imageUrl:
          item.imageId !== undefined ? await ctx.storage.getUrl(item.imageId) : null,
        videoUrl:
          item.videoId !== undefined ? await ctx.storage.getUrl(item.videoId) : null,
        text: item.text,
        background: item.background,
        createdAt: item.createdAt,
        caption: item.caption,
        viewed: view !== null,
        likedByMe: view?.liked === true,
      })
    }
    return {
      user: await toPublicUser(ctx, user),
      stories: items,
      startIndex,
    }
  },
})

export const packForUser = query({
  args: { userId: v.id('users') },
  returns: v.union(
    v.null(),
    v.object({
      user: publicUserValidator,
      stories: v.array(storyItem),
      startIndex: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const me = await getCurrentUser(ctx)
    if (me === null) return null
    if (args.userId !== me._id) {
      if ((await getBlock(ctx, args.userId, me._id)) !== null) return null
      if ((await getBlock(ctx, me._id, args.userId)) !== null) return null
    }
    const user = await ctx.db.get(args.userId)
    if (user === null) return null
    const siblings = await ctx.db
      .query('stories')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()
    const active = siblings
      .filter((item) => item.expiresAt > Date.now())
      .sort((a, b) => a.createdAt - b.createdAt)
    if (active.length === 0) return null
    const items = []
    for (const item of active) {
      const view = await ctx.db
        .query('storyViews')
        .withIndex('by_story_and_viewer', (q) =>
          q.eq('storyId', item._id).eq('viewerId', me._id),
        )
        .first()
      items.push({
        _id: item._id,
        imageUrl:
          item.imageId !== undefined ? await ctx.storage.getUrl(item.imageId) : null,
        videoUrl:
          item.videoId !== undefined ? await ctx.storage.getUrl(item.videoId) : null,
        text: item.text,
        background: item.background,
        createdAt: item.createdAt,
        caption: item.caption,
        viewed: view !== null,
        likedByMe: view?.liked === true,
      })
    }
    return {
      user: await toPublicUser(ctx, user),
      stories: items,
      startIndex: 0,
    }
  },
})

export const viewers = query({
  args: { storyId: v.id('stories') },
  returns: v.array(
    v.object({
      user: publicUserValidator,
      viewedAt: v.number(),
      liked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const story = await ctx.db.get(args.storyId)
    if (story === null) return []
    if (story.userId !== me._id) throw new Error('Accès refusé')
    const rows = await ctx.db
      .query('storyViews')
      .withIndex('by_story', (q) => q.eq('storyId', args.storyId))
      .collect()
    const result = []
    for (const row of rows) {
      const user = await ctx.db.get(row.viewerId)
      if (user === null) continue
      result.push({
        user: await toPublicUser(ctx, user),
        viewedAt: row.viewedAt,
        liked: row.liked,
      })
    }
    result.sort((a, b) => Number(b.liked) - Number(a.liked) || b.viewedAt - a.viewedAt)
    return result
  },
})

export const create = mutation({
  args: {
    imageId: v.optional(v.id('_storage')),
    videoId: v.optional(v.id('_storage')),
    text: v.optional(v.string()),
    background: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  returns: v.id('stories'),
  handler: async (ctx, args) => {
    const me = await requireCompleteProfile(ctx)
    const caption = args.caption?.trim()
    if (caption !== undefined && caption.length > 120) {
      throw new Error('Légende trop longue')
    }
    const text = args.text?.trim()
    if (text !== undefined && text.length > 180) throw new Error('Texte trop long')
    if (args.imageId === undefined && args.videoId === undefined && (text === undefined || text.length === 0)) {
      throw new Error('Ajoute un texte, une photo ou une vidéo')
    }
    const now = Date.now()
    return await ctx.db.insert('stories', {
      userId: me._id,
      imageId: args.imageId,
      videoId: args.videoId,
      text: text && text.length > 0 ? text : undefined,
      background: args.background,
      createdAt: now,
      expiresAt: now + DAY_MS,
      caption: caption && caption.length > 0 ? caption : undefined,
    })
  },
})

export const markViewed = mutation({
  args: { storyId: v.id('stories') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const story = await ctx.db.get(args.storyId)
    if (story === null) return null
    if (story.userId === me._id) return null
    const existing = await ctx.db
      .query('storyViews')
      .withIndex('by_story_and_viewer', (q) =>
        q.eq('storyId', args.storyId).eq('viewerId', me._id),
      )
      .first()
    if (existing !== null) return null
    await ctx.db.insert('storyViews', {
      storyId: args.storyId,
      viewerId: me._id,
      viewedAt: Date.now(),
      liked: false,
    })
    return null
  },
})

export const toggleLike = mutation({
  args: { storyId: v.id('stories') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const story = await ctx.db.get(args.storyId)
    if (story === null) throw new Error('Story introuvable')
    if (story.userId === me._id) throw new Error('Tu ne peux pas liker ta story')
    const existing = await ctx.db
      .query('storyViews')
      .withIndex('by_story_and_viewer', (q) =>
        q.eq('storyId', args.storyId).eq('viewerId', me._id),
      )
      .first()
    if (existing === null) {
      await ctx.db.insert('storyViews', {
        storyId: args.storyId,
        viewerId: me._id,
        viewedAt: Date.now(),
        liked: true,
      })
      return true
    }
    const liked = !existing.liked
    await ctx.db.patch(existing._id, { liked })
    return liked
  },
})

export const cleanupExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query('stories')
      .withIndex('by_expiresAt', (q) => q.lt('expiresAt', Date.now()))
      .take(50)
    for (const story of expired) {
      const views = await ctx.db
        .query('storyViews')
        .withIndex('by_story', (q) => q.eq('storyId', story._id))
        .collect()
      for (const view of views) await ctx.db.delete(view._id)
      await ctx.db.delete(story._id)
    }
    return null
  },
})
