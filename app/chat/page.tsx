import { Suspense } from 'react'
import ChatApp from '@/components/chat/ChatApp'

export default function ChatPage() {
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
