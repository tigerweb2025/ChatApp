import { Suspense } from 'react'
import { auth } from '@clerk/nextjs/server'
import ChatApp from '@/components/chat/ChatApp'

export default async function ChatPage() {
  await auth.protect()

  return (
    <Suspense
      fallback={
        <div className="flex h-svh items-center justify-center text-sm text-neutral-400">
          Chargement…
        </div>
      }
    >
      <ChatApp />
    </Suspense>
  )
}
