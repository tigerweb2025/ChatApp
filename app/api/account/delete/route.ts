import { auth, clerkClient } from '@clerk/nextjs/server'
import { fetchMutation } from 'convex/nextjs'
import { NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'

export async function POST() {
  const session = await auth()
  if (!session.userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const token = await session.getToken({ template: 'convex' })
  if (!token) {
    return NextResponse.json({ error: 'Session Convex introuvable' }, { status: 401 })
  }

  try {
    await fetchMutation(api.users.deleteMyAccount, {}, { token })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Impossible de supprimer les données'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const client = await clerkClient()
  await client.users.deleteUser(session.userId)
  return NextResponse.json({ ok: true })
}
