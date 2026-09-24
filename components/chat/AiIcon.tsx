export default function AiIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 3.2 13.7 8.3 18.8 10 13.7 11.7 12 16.8 10.3 11.7 5.2 10 10.3 8.3 12 3.2Z"
        fill="currentColor"
      />
      <circle cx="19.2" cy="5.2" r="1.15" fill="currentColor" />
      <circle cx="5.1" cy="17.6" r="0.9" fill="currentColor" />
      <path
        d="M16.6 16.2c.9.35 1.55 1.1 1.8 2.05"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
