export function clerkErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const record = error as {
      errors?: { longMessage?: string; long_message?: string; message?: string }[]
      message?: string
    }
    const first = record.errors?.[0]
    const detailed = first?.longMessage ?? first?.long_message ?? first?.message
    if (detailed && detailed.length > 0) return detailed
    if (record.message && !/unprocessable/i.test(record.message)) return record.message
  }
  if (error instanceof Error && !/unprocessable/i.test(error.message)) {
    return error.message
  }
  return fallback
}
