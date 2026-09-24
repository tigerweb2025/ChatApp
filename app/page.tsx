'use client'

import Link from 'next/link'
import { MessageCircle, Sparkles, Zap } from 'lucide-react'
import { Authenticated, Unauthenticated } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

function RedirectToChat() {
  const router = useRouter()

  useEffect(() => {
    router.push('/chat')
  }, [router])

  return (
    <div className="flex min-h-svh items-center justify-center text-sm text-neutral-400">
      Redirection…
    </div>
  )
}

export default function LandingPage() {
  return (
    <>
      <Authenticated>
        <RedirectToChat />
      </Authenticated>

      <Unauthenticated>
        <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand">
            <MessageCircle className="h-8 w-8 text-white" />
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">ChatApp</h1>
          <p className="mt-3 max-w-md text-neutral-500">
            Une messagerie en temps réel : groupes, vocaux, réactions, et une IA qui suggère tes prochaines réponses.
          </p>

          <div className="mt-8 flex gap-6 text-sm text-neutral-400">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Temps réel
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Suggestions IA
            </div>
          </div>

          <Link
            href="/sign-up"
            className="mt-10 rounded-xl bg-brand px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-hover"
          >
            Démarrer une conversation
          </Link>
        </div>
      </Unauthenticated>
    </>
  )
}
