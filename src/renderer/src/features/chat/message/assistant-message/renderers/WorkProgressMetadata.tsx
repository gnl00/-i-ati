import { useEffect, useState } from 'react'
import { formatDuration } from '@renderer/shared/lib/formatDuration'

export function WorkProgressMetadata({ toolCount = 0, startedAt, endedAt, running = false, durationBadge = false }: {
  toolCount?: number
  startedAt?: number
  endedAt?: number
  running?: boolean
  durationBadge?: boolean
}): React.ReactElement | null {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running || startedAt == null || endedAt != null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return (): void => window.clearInterval(timer)
  }, [running, startedAt, endedAt])
  const duration = startedAt != null && (endedAt != null || running)
    ? Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000))
    : undefined
  if (toolCount <= 0 && duration == null) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[10.5px] leading-4 text-(--chat-text-secondary)">
      {toolCount > 0 && <span data-testid="work-tool-count" className="inline-flex h-5 items-center rounded-[5px] bg-(--app-surface-inset)/45 px-1.5 dark:bg-(--chat-surface-raised)/55">{toolCount} {toolCount === 1 ? 'Tool' : 'Tools'}</span>}
      {duration != null && <span data-testid="work-duration" className={durationBadge
        ? 'inline-flex h-5 items-center justify-center rounded-[5px] bg-[rgb(100_116_139/0.04)] px-1.5 tabular-nums dark:bg-[rgb(220_228_238/0.035)]'
        : 'min-w-[3ch] text-right tabular-nums opacity-70'}>{formatDuration(duration)}</span>}
    </span>
  )
}
