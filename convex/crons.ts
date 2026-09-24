import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval('cleanup typing', { minutes: 1 }, internal.typing.cleanup)
crons.interval('cleanup expired stories', { minutes: 15 }, internal.stories.cleanupExpired)

export default crons
