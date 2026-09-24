'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { formatDuration } from '@/lib/format'

export default function VoicePlayer({
  src,
  durationMs,
  waveform,
  mine,
}: {
  src: string
  durationMs: number
  waveform: number[]
  mine: boolean
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (audio === null) return
    function onTime() {
      if (!audio || !audio.duration) return
      setProgress(audio.currentTime / audio.duration)
    }
    function onEnd() {
      setPlaying(false)
      setProgress(0)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [src])

  async function toggle() {
    const audio = audioRef.current
    if (audio === null) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    await audio.play()
    setPlaying(true)
  }

  const bars = waveform.length > 0 ? waveform : Array.from({ length: 28 }, () => 0.35)

  return (
    <div className="flex min-w-[180px] items-center gap-2 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={() => void toggle()}
        className={`flex h-8 w-8 items-center justify-center rounded-full ${
          mine ? 'bg-white/15 text-white' : 'bg-neutral-900 text-white'
        }`}
        aria-label={playing ? 'Pause' : 'Lecture'}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <div className="flex h-8 flex-1 items-center gap-[2px]">
        {bars.map((value, index) => {
          const active = index / bars.length <= progress
          return (
            <span
              key={index}
              className={`inline-block w-[3px] rounded-full ${
                mine
                  ? active
                    ? 'bg-white'
                    : 'bg-white/35'
                  : active
                    ? 'bg-neutral-900'
                    : 'bg-neutral-300'
              }`}
              style={{ height: `${Math.max(18, Math.round(value * 28))}px` }}
            />
          )
        })}
      </div>
      <span className={`w-9 text-right text-[10px] tabular-nums ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
        {formatDuration(playing ? progress * durationMs : durationMs)}
      </span>
    </div>
  )
}
