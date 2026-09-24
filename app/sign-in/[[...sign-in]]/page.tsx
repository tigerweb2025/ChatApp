import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f7fb] px-4">
      <SignIn
        forceRedirectUrl="/chat"
        signUpUrl="/sign-up"
        appearance={{
          elements: {
            formButtonPrimary: 'bg-brand hover:bg-brand-hover',
            card: 'shadow-none border border-neutral-200',
          },
        }}
      />
    </div>
  )
}
