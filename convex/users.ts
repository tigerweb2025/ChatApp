import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import {
  assertBirthDate,
  assertUsernameFree,
  DAY_MS,
  getCurrentUser,
  normalizeUsername,
  publicUserValidator,
  requireUser,
  toPublicUser,
  uniqueUsername,
} from './lib'

const meValidator = v.object({
  _id: v.id('users'),
  name: v.string(),
  username: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  lastSeenAt: v.optional(v.number()),
  bio: v.optional(v.string()),
  age: v.union(v.number(), v.null()),
  note: v.optional(v.string()),
  birthDate: v.optional(v.string()),
  profileCompleted: v.boolean(),
  clerkId: v.string(),
})

export const getOrCreateUser = mutation({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new Error('Non authentifié')

    const existing = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .first()

    const name = identity.name ?? identity.email ?? 'Utilisateur'
    const email = identity.email ?? ''
    const imageUrl = identity.pictureUrl

    if (existing !== null) {
      const patch: {
        name?: string
        email?: string
        imageUrl?: string
        username?: string
      } = {}
      if (
        existing.profileCompleted !== true &&
        identity.name &&
        identity.name !== existing.name
      ) {
        patch.name = identity.name
      }
      if (email && email !== existing.email) patch.email = email
      if (
        existing.imageStorageId === undefined &&
        imageUrl &&
        imageUrl !== existing.imageUrl
      ) {
        patch.imageUrl = imageUrl
      }
      if (existing.username === undefined) {
        patch.username = await uniqueUsername(ctx, name || email)
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch)
      }
      return existing._id
    }

    return await ctx.db.insert('users', {
      clerkId: identity.subject,
      name,
      email,
      imageUrl,
      username: await uniqueUsername(ctx, name || email),
      lastSeenAt: Date.now(),
      profileCompleted: false,
    })
  },
})

export const updateProfile = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    birthDate: v.string(),
    bio: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const name = args.name.trim()
    if (name.length < 2 || name.length > 40) {
      throw new Error('Le nom doit faire entre 2 et 40 caractères')
    }

    const username = normalizeUsername(args.username)
    await assertUsernameFree(ctx, username, me._id)
    const birthDate = assertBirthDate(args.birthDate)
    const bio = args.bio.trim()
    if (bio.length > 160) throw new Error('La bio ne peut pas dépasser 160 caractères')

    await ctx.db.patch(me._id, {
      name,
      username,
      birthDate,
      bio,
      profileCompleted: true,
    })
    return null
  },
})

export const setAvatar = mutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    await ctx.db.patch(me._id, { imageStorageId: args.storageId })
    return null
  },
})

export const setNote = mutation({
  args: { note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx)
    const note = args.note.trim()
    if (note.length === 0) {
      await ctx.db.patch(me._id, { note: undefined, noteAt: undefined })
      return null
    }
    if (note.length > 30) throw new Error('La note fait 30 caractères max')
    await ctx.db.patch(me._id, { note, noteAt: Date.now() })
    return null
  },
})

export const me = query({
  args: {},
  returns: v.union(v.null(), meValidator),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (user === null) return null
    const publicUser = await toPublicUser(ctx, user)
    const noteFresh =
      user.note !== undefined &&
      user.noteAt !== undefined &&
      Date.now() - user.noteAt < DAY_MS
    return {
      ...publicUser,
      note: noteFresh ? user.note : undefined,
      birthDate: user.birthDate,
      profileCompleted: user.profileCompleted === true,
      clerkId: user.clerkId,
    }
  },
})

export const getProfile = query({
  args: { userId: v.id('users') },
  returns: v.union(v.null(), publicUserValidator),
  handler: async (ctx, args) => {
    const meUser = await getCurrentUser(ctx)
    if (meUser === null) return null
    const user = await ctx.db.get(args.userId)
    if (user === null) return null
    return await toPublicUser(ctx, user)
  },
})

export const searchUsers = query({
  args: { q: v.string() },
  returns: v.array(publicUserValidator),
  handler: async (ctx, args) => {
    const meUser = await getCurrentUser(ctx)
    if (meUser === null) return []

    const blockedByMe = await ctx.db
      .query('blocks')
      .withIndex('by_blocker', (q) => q.eq('blockerId', meUser._id))
      .collect()
    const blockedMe = await ctx.db
      .query('blocks')
      .withIndex('by_blocked', (q) => q.eq('blockedId', meUser._id))
      .collect()
    const iBlockedSet = new Set(blockedByMe.map((row) => row.blockedId))
    const theyBlockedSet = new Set(blockedMe.map((row) => row.blockerId))

    const now = Date.now()
    async function withStories(
      user: {
        _id: Id<'users'>
        name: string
        username?: string
        imageUrl?: string
        lastSeenAt?: number
        bio?: string
        age: number | null
        note?: string
        iBlocked?: boolean
        blockedByThem?: boolean
      },
    ) {
      if (user.iBlocked || user.blockedByThem) {
        return { ...user, hasStories: false, firstStoryId: undefined }
      }
      const rows = await ctx.db
        .query('stories')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .collect()
      const first = rows
        .filter((story) => story.expiresAt > now)
        .sort((a, b) => a.createdAt - b.createdAt)[0]
      return {
        ...user,
        hasStories: first !== undefined,
        firstStoryId: first?._id,
      }
    }

    const term = args.q.trim().replace(/^@/, '').toLowerCase()

    if (term.length === 0) {
      const asOne = await ctx.db
        .query('conversations')
        .withIndex('by_participant_one', (q) => q.eq('participantOneId', meUser._id))
        .collect()
      const asTwo = await ctx.db
        .query('conversations')
        .withIndex('by_participant_two', (q) => q.eq('participantTwoId', meUser._id))
        .collect()
      const memberRows = await ctx.db
        .query('members')
        .withIndex('by_user', (q) => q.eq('userId', meUser._id))
        .collect()

      const otherIds: typeof meUser._id[] = []
      for (const conversation of [...asOne, ...asTwo].sort(
        (a, b) => b.lastMessageAt - a.lastMessageAt,
      )) {
        const other =
          conversation.participantOneId === meUser._id
            ? conversation.participantTwoId
            : conversation.participantOneId
        if (other !== undefined) otherIds.push(other)
      }
      for (const row of memberRows) {
        const peers = await ctx.db
          .query('members')
          .withIndex('by_conversation', (q) => q.eq('conversationId', row.conversationId))
          .collect()
        for (const peer of peers) {
          if (peer.userId !== meUser._id) otherIds.push(peer.userId)
        }
      }

      const seen = new Set<string>()
      const suggestions = []
      for (const id of otherIds) {
        if (seen.has(id)) continue
        seen.add(id)
        const user = await ctx.db.get(id)
        if (user !== null) {
          suggestions.push(
            await withStories({
              ...(await toPublicUser(ctx, user)),
              iBlocked: iBlockedSet.has(id),
              blockedByThem: theyBlockedSet.has(id),
            }),
          )
        }
        if (suggestions.length >= 8) break
      }

      if (suggestions.length < 8) {
        const extras = await ctx.db.query('users').order('desc').take(30)
        for (const user of extras) {
          if (user._id === meUser._id || seen.has(user._id)) continue
          suggestions.push(
            await withStories({
              ...(await toPublicUser(ctx, user)),
              iBlocked: iBlockedSet.has(user._id),
              blockedByThem: theyBlockedSet.has(user._id),
            }),
          )
          if (suggestions.length >= 8) break
        }
      }
      return suggestions
    }

    const all = await ctx.db.query('users').take(200)
    const matched = []
    for (const user of all) {
      if (user._id === meUser._id) continue
      if (
        user.name.toLowerCase().includes(term) ||
        (user.username !== undefined && user.username.toLowerCase().includes(term))
      ) {
        matched.push(
          await withStories({
            ...(await toPublicUser(ctx, user)),
            iBlocked: iBlockedSet.has(user._id),
            blockedByThem: theyBlockedSet.has(user._id),
          }),
        )
      }
      if (matched.length >= 10) break
    }
    return matched
  },
})

export const deleteMyAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const me = await requireUser(ctx)

    const myStories = await ctx.db
      .query('stories')
      .withIndex('by_user', (q) => q.eq('userId', me._id))
      .collect()
    for (const story of myStories) {
      const views = await ctx.db
        .query('storyViews')
        .withIndex('by_story', (q) => q.eq('storyId', story._id))
        .collect()
      for (const view of views) await ctx.db.delete(view._id)
      await ctx.db.delete(story._id)
    }

    const myViews = await ctx.db
      .query('storyViews')
      .withIndex('by_viewer', (q) => q.eq('viewerId', me._id))
      .collect()
    for (const view of myViews) await ctx.db.delete(view._id)

    const blocked = await ctx.db
      .query('blocks')
      .withIndex('by_blocker', (q) => q.eq('blockerId', me._id))
      .collect()
    const blockedBy = await ctx.db
      .query('blocks')
      .withIndex('by_blocked', (q) => q.eq('blockedId', me._id))
      .collect()
    for (const row of [...blocked, ...blockedBy]) await ctx.db.delete(row._id)

    const memberRows = await ctx.db
      .query('members')
      .withIndex('by_user', (q) => q.eq('userId', me._id))
      .collect()
    for (const row of memberRows) {
      const conversation = await ctx.db.get(row.conversationId)
      await ctx.db.delete(row._id)
      if (conversation === null) continue
      if (conversation.kind === 'group') continue
      const messages = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
        .collect()
      for (const message of messages) await ctx.db.delete(message._id)
      const leftoverMembers = await ctx.db
        .query('members')
        .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
        .collect()
      for (const leftover of leftoverMembers) await ctx.db.delete(leftover._id)
      await ctx.db.delete(conversation._id)
    }

    const asOne = await ctx.db
      .query('conversations')
      .withIndex('by_participant_one', (q) => q.eq('participantOneId', me._id))
      .collect()
    const asTwo = await ctx.db
      .query('conversations')
      .withIndex('by_participant_two', (q) => q.eq('participantTwoId', me._id))
      .collect()
    for (const conversation of [...asOne, ...asTwo]) {
      const still = await ctx.db.get(conversation._id)
      if (still === null) continue
      const messages = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
        .collect()
      for (const message of messages) await ctx.db.delete(message._id)
      await ctx.db.delete(conversation._id)
    }

    await ctx.db.delete(me._id)
    return null
  },
})
