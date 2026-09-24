export function clampMenu(
  x: number,
  y: number,
  width: number,
  height: number,
  pad = 8,
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = x
  let top = y
  if (left + width > vw - pad) left = vw - width - pad
  if (left < pad) left = pad
  if (top + height > vh - pad) top = y - height
  if (top < pad) top = pad
  if (top + height > vh - pad) top = Math.max(pad, vh - height - pad)
  return { left, top }
}
