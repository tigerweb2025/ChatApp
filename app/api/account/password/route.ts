import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { clerkErrorMessage } from '@/lib/clerkError'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = (await request.json()) as {
    password?: string
    currentPassword?: string
  }
  const password = body.password?.trim() ?? ''
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Le mot de passe doit faire au moins 8 caractères' },
      { status: 400 },
    )
  }

  const client = await clerkClient()
  const user = await client.users.getUser(userId)

  if (user.passwordEnabled) {
    const current = body.currentPassword ?? ''
    if (current.length === 0) {
      return NextResponse.json(
        { error: 'Entre ton mot de passe actuel' },
        { status: 400 },
      )
    }
    try {
      const verified = await client.users.verifyPassword({
        userId,
        password: current,
      })
      if (!verified.verified) {
        return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 400 })
      }
    } catch (error) {
      return NextResponse.json(
        { error: clerkErrorMessage(error, 'Mot de passe actuel incorrect') },
        { status: 400 },
      )
    }
  }

  try {
    await client.users.updateUser(userId, {
      password,
      skipPasswordChecks: !user.passwordEnabled,
      signOutOfOtherSessions: false,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: clerkErrorMessage(
          error,
          'Impossible d’enregistrer ce mot de passe. Essaie un mot de passe plus long et moins courant.',
        ),
      },
      { status: 400 },
    )
  }
}
