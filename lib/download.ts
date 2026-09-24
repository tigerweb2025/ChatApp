export async function downloadUrl(url: string, filename: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('fetch')
    const blob = await response.blob()
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(href)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
