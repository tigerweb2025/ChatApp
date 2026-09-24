import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f7fb] px-4">
      <SignUp
        forceRedirectUrl="/chat"
        signInUrl="/sign-in"
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
