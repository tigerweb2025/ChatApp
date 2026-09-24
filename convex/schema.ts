import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    username: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    lastSeenAt: v.optional(v.number()),
    bio: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    profileCompleted: v.optional(v.boolean()),
    note: v.optional(v.string()),
    noteAt: v.optional(v.number()),
  })
    .index('by_clerk_id', ['clerkId'])
    .index('by_username', ['username']),

  conversations: defineTable({
    participantOneId: v.optional(v.id('users')),
    participantTwoId: v.optional(v.id('users')),
    lastMessageAt: v.number(),
    participantOneLastReadAt: v.optional(v.number()),
    participantTwoLastReadAt: v.optional(v.number()),
    kind: v.optional(v.union(v.literal('dm'), v.literal('group'))),
    title: v.optional(v.string()),
    createdBy: v.optional(v.id('users')),
    hiddenFor: v.optional(v.array(v.id('users'))),
    description: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    writePolicy: v.optional(v.union(v.literal('all'), v.literal('admins'))),
    deleteVotes: v.optional(v.array(v.id('users'))),
  })
    .index('by_participant_one', ['participantOneId'])
    .index('by_participant_two', ['participantTwoId']),

  members: defineTable({
    conversationId: v.id('conversations'),
    userId: v.id('users'),
    lastReadAt: v.optional(v.number()),
    role: v.union(v.literal('admin'), v.literal('member')),
    joinedAt: v.number(),
    unseenPreview: v.optional(
      v.object({
        kind: v.union(
          v.literal('reaction'),
          v.literal('note_like'),
          v.literal('note_reply'),
        ),
        emoji: v.optional(v.string()),
        fromName: v.string(),
        at: v.number(),
      }),
    ),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_user', ['userId'])
    .index('by_conversation_and_user', ['conversationId', 'userId']),

  messages: defineTable({
    conversationId: v.id('conversations'),
    senderId: v.id('users'),
    content: v.string(),
    createdAt: v.number(),
    imageId: v.optional(v.id('_storage')),
    audioId: v.optional(v.id('_storage')),
    audioDurationMs: v.optional(v.number()),
    waveform: v.optional(v.array(v.number())),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    hiddenFor: v.optional(v.array(v.id('users'))),
    forwardedFrom: v.optional(v.id('messages')),
    reactions: v.optional(
      v.array(
        v.object({
          emoji: v.string(),
          userId: v.id('users'),
        }),
      ),
    ),
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
    storyId: v.optional(v.id('stories')),
    replyToId: v.optional(v.id('messages')),
    noteText: v.optional(v.string()),
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
    .index('by_conversation', ['conversationId'])
    .index('by_conversation_and_time', ['conversationId', 'createdAt']),

  typing: defineTable({
    conversationId: v.id('conversations'),
    userId: v.id('users'),
    updatedAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_conversation_and_user', ['conversationId', 'userId'])
    .index('by_updatedAt', ['updatedAt']),

  blocks: defineTable({
    blockerId: v.id('users'),
    blockedId: v.id('users'),
    createdAt: v.number(),
    leftoverMessage: v.optional(v.string()),
    leftoverSentAt: v.optional(v.number()),
    leftoverConversationId: v.optional(v.id('conversations')),
    leftoverRevealedAt: v.optional(v.number()),
  })
    .index('by_blocker', ['blockerId'])
    .index('by_blocked', ['blockedId'])
    .index('by_pair', ['blockerId', 'blockedId']),

  stories: defineTable({
    userId: v.id('users'),
    imageId: v.optional(v.id('_storage')),
    videoId: v.optional(v.id('_storage')),
    text: v.optional(v.string()),
    background: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    caption: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_expiresAt', ['expiresAt']),

  storyViews: defineTable({
    storyId: v.id('stories'),
    viewerId: v.id('users'),
    viewedAt: v.number(),
    liked: v.boolean(),
  })
    .index('by_story', ['storyId'])
    .index('by_viewer', ['viewerId'])
    .index('by_story_and_viewer', ['storyId', 'viewerId']),

  noteLikes: defineTable({
    ownerId: v.id('users'),
    likerId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerId'])
    .index('by_pair', ['ownerId', 'likerId']),

  noteReplies: defineTable({
    ownerId: v.id('users'),
    authorId: v.id('users'),
    content: v.string(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerId']),

  noteReplyLikes: defineTable({
    replyId: v.id('noteReplies'),
    likerId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_reply', ['replyId'])
    .index('by_pair', ['replyId', 'likerId']),
})
