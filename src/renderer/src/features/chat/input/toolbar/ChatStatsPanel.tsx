import { TokensIcon } from '@radix-ui/react-icons'
import { Button } from '@renderer/shared/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/shared/components/ui/popover'
import { cn } from '@renderer/shared/lib/utils'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import {
  CircleGauge,
  Sparkles,
  Wrench
} from 'lucide-react'
import React, { useState } from 'react'
import {
  buildChatStatsModel,
  formatCompactTokenCount,
  formatProgressPercent
} from './chatStatsModel'
import { useChatStatsData } from './useChatStatsData'

interface ChatStatsPanelProps {
  variant?: 'popover' | 'inline'
}

const ChatStatsPanel: React.FC<ChatStatsPanelProps> = ({
  variant = 'popover'
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const messages = useChatStore(state => state.messages)
  const currentChatId = useChatStore(state => state.currentChatId)
  const currentChatUuid = useChatStore(state => state.currentChatUuid)
  const selectedModelRef = useChatStore(state => state.selectedModelRef)
  const compressionPending = useChatStore(
    state => state.postRunJobs.compression === 'pending'
  )
  const compressionSummaryRevision = useChatStore(state => (
    currentChatUuid
      ? (state.compressionSummaryRevisionByChatUuid[currentChatUuid] ?? 0)
      : 0
  ))
  const appConfig = useAppConfigStore(state => state.appConfig)
  const mainModelRef = useAppConfigStore(state => state.mainModel)
  const resolveModelRef = useAppConfigStore(state => state.resolveModelRef)
  const providersRevision = useAppConfigStore(state => state.providersRevision)
  const persistedStats = useChatStatsData(currentChatId, compressionSummaryRevision)

  const activeModel = React.useMemo(
    () => resolveModelRef(selectedModelRef ?? mainModelRef)?.model,
    [mainModelRef, providersRevision, resolveModelRef, selectedModelRef]
  )

  const stats = React.useMemo(() => buildChatStatsModel({
    messages,
    activeCompressedMessageIds: persistedStats.activeCompressedMessageIds,
    contextWindowTokens: activeModel?.contextWindowTokens,
    triggerTokenRatio: appConfig.compression?.triggerTokenRatio,
    autoCompactEnabled: Boolean(
      appConfig.compression?.enabled && appConfig.compression.autoCompress
    ),
    compressionPending
  }), [
    activeModel?.contextWindowTokens,
    appConfig.compression?.autoCompress,
    appConfig.compression?.enabled,
    appConfig.compression?.triggerTokenRatio,
    compressionPending,
    messages,
    persistedStats.activeCompressedMessageIds
  ])

  const progressPercent = stats.progressToCompact === undefined
    ? undefined
    : Number((stats.progressToCompact * 100).toFixed(1))
  const triggerPercent = formatProgressPercent(stats.triggerTokenRatio)
  const hasInitialSnapshot = currentChatId === null || persistedStats.hasSnapshot

  const statsContent = (
    <div
      className={cn(
        'flex min-h-0 flex-col text-zinc-900 dark:text-(--app-text-body)',
        variant === 'inline' ? 'min-h-full' : 'max-h-128'
      )}
    >
      <section
        className={cn(
          'shrink-0 border-b border-zinc-200/80 dark:border-(--app-border-subtle)',
          variant === 'inline' ? 'px-2 py-2 sm:px-4 sm:py-4' : 'px-1.5 py-1.5'
        )}
        aria-labelledby="auto-compact-heading"
      >
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <CircleGauge
              className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-(--app-accent-strong)"
              aria-hidden="true"
            />
            <h2
              id="auto-compact-heading"
              className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:tracking-[0.11em] dark:text-(--app-text-secondary)"
            >
              Auto Compact
            </h2>
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-2 dark:mt-5 dark:gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-(--app-text-secondary)">
              Current accumulated
            </p>
            <p className="mt-1 truncate font-mono text-base font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-(--app-text-primary)">
              {hasInitialSnapshot ? formatCompactTokenCount(stats.accumulatedTokens) : '—'}
              <span className="px-1.5 font-sans text-xs font-normal text-zinc-400 dark:text-(--app-text-muted)">
                /
              </span>
              {stats.thresholdTokens
                ? `${formatCompactTokenCount(stats.thresholdTokens)} trigger`
                : 'trigger unavailable'}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 font-mono text-sm font-semibold tabular-nums',
              stats.status === 'compacting'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-indigo-600 dark:text-(--app-accent-strong)'
            )}
            aria-label={progressPercent === undefined
              ? 'Compaction progress unavailable'
              : `${formatProgressPercent(stats.progressToCompact)} to compact`}
          >
            {hasInitialSnapshot ? formatProgressPercent(stats.progressToCompact) : '—'}
          </span>
        </div>

        <div
          className="relative mt-4 h-1.5 overflow-hidden rounded-sm bg-zinc-200/80 dark:bg-(--app-surface-inset) dark:ring-1 dark:ring-(--app-border-subtle) dark:ring-inset"
          role="progressbar"
          aria-label="Progress to automatic compaction"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hasInitialSnapshot ? progressPercent : undefined}
          aria-disabled={stats.status === 'disabled' || undefined}
        >
          <span
            className={cn(
              'absolute inset-y-0 left-0 origin-left rounded-sm transition-transform duration-500 ease-out motion-reduce:transition-none',
              stats.status === 'compacting'
                ? 'bg-amber-500 dark:bg-amber-400'
                : stats.status === 'disabled' || stats.status === 'context-unavailable'
                  ? 'bg-zinc-400 dark:bg-(--app-text-muted)'
                  : 'bg-indigo-500 dark:bg-(--app-accent)'
            )}
            style={{
              width: '100%',
              transform: `scaleX(${hasInitialSnapshot ? (stats.progressToCompact ?? 0) : 0})`
            }}
          />
          <span
            className="absolute inset-y-0 right-0 w-px bg-zinc-500/70 dark:bg-(--app-accent-strong)/70"
            aria-hidden="true"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-zinc-500 dark:text-(--app-text-muted)">
          {stats.contextWindowTokens ? (
            <>
              <span>
                Model window{' '}
                <span className="font-mono tabular-nums text-zinc-600 dark:text-(--app-text-body)">
                  {formatCompactTokenCount(stats.contextWindowTokens)}
                </span>
              </span>
              <span>
                Trigger at{' '}
                <span className="font-mono tabular-nums text-zinc-600 dark:text-(--app-text-body)">
                  {triggerPercent}
                </span>
              </span>
            </>
          ) : (
            <span>Set a context window for the active model to calculate progress.</span>
          )}
        </div>
      </section>

      <section
        className={cn(
          'shrink-0',
          variant === 'inline'
            ? 'px-5 py-5 sm:px-6 sm:py-6 dark:px-4 dark:py-4'
            : 'px-4 py-4'
        )}
        aria-labelledby="chat-activity-heading"
      >
        <h2
          id="chat-activity-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:tracking-[0.11em] dark:text-(--app-text-secondary)"
        >
          Activity
        </h2>
        <dl className="mt-4 grid grid-cols-3 dark:mt-3 dark:overflow-hidden dark:rounded-lg dark:border dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
          <div className="min-w-0 pr-3 dark:px-3 dark:py-2.5">
            <dt className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-(--app-text-muted)">
              <TokensIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
              Tokens
            </dt>
            <dd className="mt-2 truncate font-mono text-xs font-semibold tabular-nums text-zinc-800 dark:text-(--app-text-primary)">
              {formatCompactTokenCount(stats.totalConversationTokens)}
            </dd>
          </div>
          <div className="min-w-0 border-l border-zinc-200/80 px-3 dark:border-(--app-border-subtle) dark:py-2.5">
            <dt className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-(--app-text-muted)">
              <Wrench className="h-3 w-3 shrink-0" aria-hidden="true" />
              Tools
            </dt>
            <dd className="mt-2 truncate font-mono text-xs font-semibold tabular-nums text-zinc-800 dark:text-(--app-text-primary)">
              {stats.toolCallCount}/{stats.toolResultCount}
            </dd>
          </div>
          <div className="min-w-0 border-l border-zinc-200/80 pl-3 dark:border-(--app-border-subtle) dark:px-3 dark:py-2.5">
            <dt className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-(--app-text-muted)">
              <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
              Skills
            </dt>
            <dd className="mt-2 truncate font-mono text-xs font-semibold tabular-nums text-zinc-800 dark:text-(--app-text-primary)">
              {persistedStats.activeSkills.length}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )

  if (variant === 'inline') {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-zinc-50/40 dark:bg-(--app-surface)">
        {statsContent}
      </div>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="group relative flex items-center">
          <Button
            variant="outline"
            size="icon"
            role="combobox"
            aria-label="Open chat statistics"
            className={cn(
              'relative h-7 w-7 overflow-hidden border border-slate-200/50 bg-slate-50/50 transition-all duration-300 ease-out dark:border-slate-700/50 dark:bg-slate-800/50',
              'group-hover:border-slate-300 group-hover:bg-slate-100 group-hover:shadow-xs dark:group-hover:border-slate-600 dark:group-hover:bg-slate-700',
              'active:scale-95 motion-reduce:transition-none',
              'rounded-xl',
              isOpen && 'border-slate-300 bg-slate-100 shadow-xs dark:border-slate-600 dark:bg-slate-700'
            )}
          >
            <span className="absolute inset-0 bg-linear-to-br from-slate-100/0 via-slate-100/50 to-slate-200/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none dark:from-slate-700/0 dark:via-slate-700/30 dark:to-slate-600/0" />
            <TokensIcon
              className={cn(
                'relative z-10 h-4 w-4 text-slate-500 transition-transform duration-300 ease-out motion-reduce:transition-none dark:text-slate-400',
                'group-hover:scale-110 group-hover:rotate-90 group-hover:text-slate-700 dark:group-hover:text-slate-300',
                isOpen && 'scale-110 rotate-90 text-slate-700 dark:text-slate-300'
              )}
            />
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'w-80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-0 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:shadow-black/40',
          'animate-in fade-in-0 slide-in-from-top-2 zoom-in-95 motion-reduce:animate-none',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
        )}
        sideOffset={12}
        align="end"
      >
        {statsContent}
      </PopoverContent>
    </Popover>
  )
}

export default ChatStatsPanel
