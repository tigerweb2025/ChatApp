import { v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

type Ctx = QueryCtx | MutationCtx

export const DAY_MS = 24 * 60 * 60 * 1000

export const publicUserValidator = v.object({
  _id: v.id('users'),
  name: v.string(),
  username: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  lastSeenAt: v.optional(v.number()),
  bio: v.optional(v.string()),
  age: v.union(v.number(), v.null()),
  note: v.optional(v.string()),
  blockedByThem: v.optional(v.boolean()),
  iBlocked: v.optional(v.boolean()),
  hasStories: v.optional(v.boolean()),
  firstStoryId: v.optional(v.id('stories')),
})

export const unseenPreviewValidator = v.object({
  kind: v.union(
    v.literal('reaction'),
    v.literal('note_like'),
    v.literal('note_reply'),
  ),
  emoji: v.optional(v.string()),
  fromName: v.string(),
  at: v.number(),
})

export const blockStatusValidator = v.object({
  iBlocked: v.boolean(),
  theyBlocked: v.boolean(),
  leftoverAvailable: v.boolean(),
  leftoverMessage: v.optional(v.string()),
  incomingLeftover: v.optional(v.string()),
  leftoverRevealed: v.boolean(),
})

export function ageFromBirthDate(birthDate?: string): number | null {
  if (birthDate === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const born = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDelta = now.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) {
    age -= 1
  }
  return age
}

export async function toPublicUser(ctx: Ctx, user: Doc<'users'>) {
  let imageUrl = user.imageUrl
  if (user.imageStorageId !== undefined) {
    imageUrl = (await ctx.storage.getUrl(user.imageStorageId)) ?? user.imageUrl
  }
  const noteFresh =
    user.note !== undefined &&
    user.noteAt !== undefined &&
    Date.now() - user.noteAt < DAY_MS
  return {
    _id: user._id,
    name: user.name,
    username: user.username,
    imageUrl,
    lastSeenAt: user.lastSeenAt,
    bio: user.bio,
    age: ageFromBirthDate(user.birthDate),
    note: noteFresh ? user.note : undefined,
  }
}

export async function partnerUserIds(
  ctx: Ctx,
  meId: Id<'users'>,
): Promise<Set<string>> {
  const ids = new Set<string>()
  const memberRowsForMe = await ctx.db
    .query('members')
    .withIndex('by_user', (q) => q.eq('userId', meId))
    .collect()
  for (const row of memberRowsForMe) {
    const peers = await ctx.db
      .query('members')
      .withIndex('by_conversation', (q) => q.eq('conversationId', row.conversationId))
      .collect()
    for (const peer of peers) {
      if (peer.userId !== meId) ids.add(peer.userId)
    }
  }
  const asOne = await ctx.db
    .query('conversations')
    .withIndex('by_participant_one', (q) => q.eq('participantOneId', meId))
    .collect()
  const asTwo = await ctx.db
    .query('conversations')
    .withIndex('by_participant_two', (q) => q.eq('participantTwoId', meId))
    .collect()
  for (const conversation of [...asOne, ...asTwo]) {
    const other =
      conversation.participantOneId === meId
        ? conversation.participantTwoId
        : conversation.participantOneId
    if (other !== undefined) ids.add(other)
  }
  return ids
}

export async function hasDirectConversation(
  ctx: Ctx,
  userA: Id<'users'>,
  userB: Id<'users'>,
): Promise<boolean> {
  const asOne = await ctx.db
    .query('conversations')
    .withIndex('by_participant_one', (q) => q.eq('participantOneId', userA))
    .filter((q) => q.eq(q.field('participantTwoId'), userB))
    .first()
  if (asOne !== null) return true
  const asTwo = await ctx.db
    .query('conversations')
    .withIndex('by_participant_two', (q) => q.eq('participantTwoId', userA))
    .filter((q) => q.eq(q.field('participantOneId'), userB))
    .first()
  return asTwo !== null
}

export async function getBlock(
  ctx: Ctx,
  blockerId: Id<'users'>,
  blockedId: Id<'users'>,
) {
  return await ctx.db
    .query('blocks')
    .withIndex('by_pair', (q) => q.eq('blockerId', blockerId).eq('blockedId', blockedId))
    .first()
}

export async function blockStatus(
  ctx: Ctx,
  meId: Id<'users'>,
  otherId: Id<'users'>,
) {
  const mine = await getBlock(ctx, meId, otherId)
  const theirs = await getBlock(ctx, otherId, meId)
  return {
    iBlocked: mine !== null,
    theyBlocked: theirs !== null,
    leftoverAvailable: theirs !== null && theirs.leftoverMessage === undefined,
    leftoverMessage: theirs?.leftoverMessage,
    incomingLeftover: mine?.leftoverMessage,
    leftoverRevealed: mine?.leftoverRevealedAt !== undefined,
  }
}

export async function findDirectConversation(
  ctx: Ctx,
  userA: Id<'users'>,
  userB: Id<'users'>,
) {
  const asOne = await ctx.db
    .query('conversations')
    .withIndex('by_participant_one', (q) => q.eq('participantOneId', userA))
    .filter((q) => q.eq(q.field('participantTwoId'), userB))
    .first()
  if (asOne !== null) return asOne
  return await ctx.db
    .query('conversations')
    .withIndex('by_participant_two', (q) => q.eq('participantTwoId', userA))
    .filter((q) => q.eq(q.field('participantOneId'), userB))
    .first()
}

export async function setUnseenPreview(
  ctx: MutationCtx,
  conversationId: Id<'conversations'>,
  recipientId: Id<'users'>,
  preview: {
    kind: 'reaction' | 'note_like' | 'note_reply'
    emoji?: string
    fromName: string
    at: number
  },
) {
  const member = await getMember(ctx, conversationId, recipientId)
  if (member !== null) {
    await ctx.db.patch(member._id, { unseenPreview: preview })
  }
  const conversation = await ctx.db.get(conversationId)
  if (conversation === null) return
  await ctx.db.patch(conversationId, {
    lastMessageAt: preview.at,
    hiddenFor: (conversation.hiddenFor ?? []).filter((id) => id !== recipientId),
  })
}

export async function getCurrentUser(ctx: Ctx): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null

  return await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
    .first()
}

export async function requireUser(ctx: Ctx): Promise<Doc<'users'>> {
  const user = await getCurrentUser(ctx)
  if (user === null) throw new Error('Non authentifié')
  return user
}

export async function requireCompleteProfile(ctx: Ctx): Promise<Doc<'users'>> {
  const user = await requireUser(ctx)
  if (user.profileCompleted !== true) {
    throw new Error('Complète ton profil avant de continuer')
  }
  return user
}

export function isGroup(conversation: Doc<'conversations'>): boolean {
  return conversation.kind === 'group'
}

export async function getMember(
  ctx: Ctx,
  conversationId: Id<'conversations'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('members')
    .withIndex('by_conversation_and_user', (q) =>
      q.eq('conversationId', conversationId).eq('userId', userId),
    )
    .first()
}

export async function requireAdmin(
  ctx: Ctx,
  conversation: Doc<'conversations'>,
  userId: Id<'users'>,
) {
  const member = await getMember(ctx, conversation._id, userId)
  if (member === null || member.role !== 'admin') {
    throw new Error('Réservé aux admins')
  }
  return member
}

export async function adminMembers(ctx: Ctx, conversationId: Id<'conversations'>) {
  const rows = await memberRows(ctx, conversationId)
  return rows.filter((row) => row.role === 'admin')
}

export async function assertCanWrite(
  ctx: Ctx,
  conversation: Doc<'conversations'>,
  userId: Id<'users'>,
) {
  if (!isGroup(conversation)) return
  if ((conversation.writePolicy ?? 'all') !== 'admins') return
  const member = await getMember(ctx, conversation._id, userId)
  if (member === null || member.role !== 'admin') {
    throw new Error('Seuls les admins peuvent écrire dans ce groupe')
  }
}

export async function memberRows(ctx: Ctx, conversationId: Id<'conversations'>) {
  return await ctx.db
    .query('members')
    .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
    .collect()
}

export async function conversationUserIds(
  ctx: Ctx,
  conversation: Doc<'conversations'>,
): Promise<Id<'users'>[]> {
  const rows = await memberRows(ctx, conversation._id)
  if (rows.length > 0) return rows.map((row) => row.userId)

  const ids: Id<'users'>[] = []
  if (conversation.participantOneId !== undefined) ids.push(conversation.participantOneId)
  if (conversation.participantTwoId !== undefined) ids.push(conversation.participantTwoId)
  return ids
}

export async function isParticipant(
  ctx: Ctx,
  conversation: Doc<'conversations'>,
  userId: Id<'users'>,
): Promise<boolean> {
  const member = await ctx.db
    .query('members')
    .withIndex('by_conversation_and_user', (q) =>
      q.eq('conversationId', conversation._id).eq('userId', userId),
    )
    .first()
  if (member !== null) return true
  return (
    conversation.participantOneId === userId || conversation.participantTwoId === userId
  )
}

export async function requireParticipant(
  ctx: Ctx,
  conversationId: Id<'conversations'>,
  userId: Id<'users'>,
): Promise<Doc<'conversations'>> {
  const conversation = await ctx.db.get(conversationId)
  if (conversation === null) throw new Error('Conversation introuvable')
  if (!(await isParticipant(ctx, conversation, userId))) {
    throw new Error('Accès refusé')
  }
  return conversation
}

export function otherDmUserId(
  conversation: Doc<'conversations'>,
  userId: Id<'users'>,
): Id<'users'> | null {
  if (
    conversation.participantOneId === userId &&
    conversation.participantTwoId !== undefined
  ) {
    return conversation.participantTwoId
  }
  if (
    conversation.participantTwoId === userId &&
    conversation.participantOneId !== undefined
  ) {
    return conversation.participantOneId
  }
  return null
}

export async function lastReadFor(
  ctx: Ctx,
  conversation: Doc<'conversations'>,
  userId: Id<'users'>,
): Promise<number> {
  const member = await ctx.db
    .query('members')
    .withIndex('by_conversation_and_user', (q) =>
      q.eq('conversationId', conversation._id).eq('userId', userId),
    )
    .first()
  if (member?.lastReadAt !== undefined) return member.lastReadAt
  if (conversation.participantOneId === userId) {
    return conversation.participantOneLastReadAt ?? 0
  }
  if (conversation.participantTwoId === userId) {
    return conversation.participantTwoLastReadAt ?? 0
  }
  return 0
}

export async function clearTyping(
  ctx: MutationCtx,
  conversationId: Id<'conversations'>,
  userId: Id<'users'>,
) {
  const rows = await ctx.db
    .query('typing')
    .withIndex('by_conversation_and_user', (q) =>
      q.eq('conversationId', conversationId).eq('userId', userId),
    )
    .collect()
  for (const row of rows) {
    await ctx.db.delete(row._id)
  }
}

export async function touchConversation(
  ctx: MutationCtx,
  conversationId: Id<'conversations'>,
  now: number,
) {
  await ctx.db.patch(conversationId, { lastMessageAt: now, hiddenFor: [] })
}

export function slugify(input: string): string {
  const cleaned = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 18)
  return cleaned.length > 0 ? cleaned : 'user'
}

export async function uniqueUsername(ctx: Ctx, seed: string): Promise<string> {
  const base = slugify(seed)
  for (let i = 0; i < 40; i += 1) {
    const candidate = i === 0 ? base : `${base}${i}`
    const taken = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', candidate))
      .first()
    if (taken === null) return candidate
  }
  return `${base}${Date.now().toString().slice(-4)}`
}

export async function assertUsernameFree(
  ctx: Ctx,
  username: string,
  exceptUserId: Id<'users'>,
) {
  const taken = await ctx.db
    .query('users')
    .withIndex('by_username', (q) => q.eq('username', username))
    .first()
  if (taken !== null && taken._id !== exceptUserId) {
    throw new Error('Ce pseudo est déjà pris')
  }
}

export function normalizeUsername(raw: string): string {
  const username = raw.trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new Error('Pseudo : 3-20 caractères, lettres, chiffres ou _')
  }
  return username
}

export function assertBirthDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date de naissance invalide')
  }
  const born = new Date(`${value}T00:00:00`)
  if (Number.isNaN(born.getTime())) throw new Error('Date de naissance invalide')
  const now = new Date()
  if (born.getTime() > now.getTime()) throw new Error('Date de naissance invalide')
  const age = ageFromBirthDate(value)
  if (age === null || age < 13) throw new Error('Tu dois avoir au moins 13 ans')
  if (age > 120) throw new Error('Date de naissance invalide')
  return value
}
