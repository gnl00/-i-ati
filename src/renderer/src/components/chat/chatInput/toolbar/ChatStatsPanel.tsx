import { TokensIcon } from '@radix-ui/react-icons'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useAssistantStore } from '@renderer/store/assistant'
import React, { useState } from 'react'
import { getChatSkills } from '@renderer/db/ChatSkillRepository'
import { getCompressedSummariesByChatId } from '@renderer/db/CompressedSummaryRepository'
import { Wrench, Sparkles, Compass } from 'lucide-react'

const ChatStatsPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const messages = useChatStore(state => state.messages)
  const currentChatId = useChatStore(state => state.currentChatId)
  const { appConfig } = useAppConfigStore()
  const { currentAssistant } = useAssistantStore()
  const [displayAssistant, setDisplayAssistant] = useState<Assistant | null>(null)
  const [isExiting, setIsExiting] = useState(false)
  const [activeSkills, setActiveSkills] = useState<string[]>([])
  const [compressionCount, setCompressionCount] = useState<number>(0)
  const [activeCompressedMessageIds, setActiveCompressedMessageIds] = useState<Set<number>>(new Set())

  // Handle assistant change with exit animation
  React.useEffect(() => {
    if (currentAssistant) {
      setDisplayAssistant(currentAssistant)
      setIsExiting(false)
    } else if (displayAssistant) {
      // Start exit animation
      setIsExiting(true)
      // Remove after animation completes
      const timer = setTimeout(() => {
        setDisplayAssistant(null)
        setIsExiting(false)
      }, 300) // Match animation duration
      return () => clearTimeout(timer)
    }
    return undefined
  }, [currentAssistant, displayAssistant])

  React.useEffect(() => {
    if (!currentChatId) {
      setActiveSkills([])
      setCompressionCount(0)
      setActiveCompressedMessageIds(new Set())
      return
    }
    getChatSkills(currentChatId)
      .then(setActiveSkills)
      .catch(() => setActiveSkills([]))
    getCompressedSummariesByChatId(currentChatId)
      .then(result => {
        setCompressionCount(result.length)
        const activeIds = new Set<number>()
        result
          .filter(summary => summary.status === 'active')
          .forEach(summary => {
            summary.messageIds.forEach(id => activeIds.add(id))
          })
        setActiveCompressedMessageIds(activeIds)
      })
      .catch(() => {
        setCompressionCount(0)
        setActiveCompressedMessageIds(new Set())
      })
  }, [currentChatId])

  const tokenTotal = React.useMemo(() => {
    return messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0)
  }, [messages])

  const selectedModelRef = useChatStore(state => state.selectedModelRef)

  const activeModel = React.useMemo(() => {
    const accountId = selectedModelRef?.accountId ?? appConfig?.tools?.defaultModel?.accountId
    const modelId = selectedModelRef?.modelId ?? appConfig?.tools?.defaultModel?.modelId
    if (!accountId || !modelId) {
      return undefined
    }

    return appConfig?.accounts
      ?.find(account => account.id === accountId)
      ?.models.find(model => model.id === modelId)
  }, [appConfig?.accounts, appConfig?.tools?.defaultModel, selectedModelRef])

  const compressionTokenTotal = React.useMemo(() => {
    return messages.reduce((sum, msg) => {
      if (msg.id && activeCompressedMessageIds.has(msg.id)) {
        return sum
      }
      return sum + (msg.tokens || 0)
    }, 0)
  }, [activeCompressedMessageIds, messages])

  const compressionUsagePercent = React.useMemo(() => {
    const contextWindowTokens = activeModel?.contextWindowTokens
    if (!contextWindowTokens || contextWindowTokens <= 0) {
      return undefined
    }
    return Math.min(100, Math.round((compressionTokenTotal / contextWindowTokens) * 100))
  }, [activeModel?.contextWindowTokens, compressionTokenTotal])

  const compressionTriggerPercent = Math.round((appConfig?.compression?.triggerTokenRatio ?? 0.7) * 100)
  const compressionProgressPercent = Math.min(compressionUsagePercent ?? 0, compressionTriggerPercent)
  const compressionProgressWidth = compressionTriggerPercent > 0
    ? Math.min(100, Math.round((compressionProgressPercent / compressionTriggerPercent) * 100))
    : 0

  const toolCallCount = React.useMemo(() => {
    return messages.reduce((sum, msg) => {
      const segments = msg.body.segments || []
      const toolSegments = segments.filter(seg => seg.type === 'toolCall').length
      return sum + toolSegments
    }, 0)
  }, [messages])

  const toolResultCount = React.useMemo(() => {
    return messages.filter(msg => msg.body.role === 'tool').length
  }, [messages])

  const compressionEnabled = appConfig?.compression?.enabled ?? true

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative flex items-center group">
          {/* Assistant Icon - Slides in/out with animation */}
          {displayAssistant && (
            <div
              key={displayAssistant.id}
              className={cn(
                "flex items-center justify-center h-7 px-2 rounded-l-xl",
                "bg-slate-50/50 dark:bg-slate-800/50",
                "border-l border-t border-b border-slate-200/50 dark:border-slate-700/50",
                "transition-all duration-300 ease-out",
                isExiting
                  ? "animate-out slide-out-to-right-2 fade-out-0 duration-300"
                  : "animate-in slide-in-from-right-2 fade-in-0 duration-300",
                "group-hover:bg-slate-100 dark:group-hover:bg-slate-700",
                "group-hover:border-slate-300 dark:group-hover:border-slate-600",
                isOpen && [
                  "bg-slate-100 dark:bg-slate-700",
                  "border-slate-300 dark:border-slate-600"
                ]
              )}
            >
              <span className="text-xs leading-none text-gray-500 hover:text-gray-700 font-medium transition-all">
                {displayAssistant.name}
              </span>
            </div>
          )}

          {/* Token Button - Connects seamlessly with assistant label */}
          <Button
            variant="outline"
            size="icon"
            role="combobox"
            className={cn(
              "relative h-7 w-7 overflow-hidden",
              "transition-all duration-300 ease-out",
              "bg-slate-50/50 dark:bg-slate-800/50",
              "border border-slate-200/50 dark:border-slate-700/50",
              "group-hover:bg-slate-100 dark:group-hover:bg-slate-700",
              "group-hover:border-slate-300 dark:group-hover:border-slate-600",
              "group-hover:shadow-xs",
              "active:scale-95",
              currentAssistant ? [
                // When assistant is present, remove left border radius to connect
                "rounded-r-xl rounded-l-none",
                "border-l-0"
              ] : [
                // When no assistant, keep full rounded
                "rounded-xl"
              ],
              isOpen && [
                "bg-slate-100 dark:bg-slate-700",
                "border-slate-300 dark:border-slate-600",
                "shadow-xs"
              ]
            )}
          >
            {/* Animated background on hover */}
            <div className="absolute inset-0 bg-linear-to-br from-slate-100/0 via-slate-100/50 to-slate-200/0 dark:from-slate-700/0 dark:via-slate-700/30 dark:to-slate-600/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* TokensIcon */}
            <TokensIcon
              className={cn(
                "relative z-10 w-4 h-4 text-slate-500 dark:text-slate-400",
                "transition-all duration-300 ease-out",
                "group-hover:text-slate-700 dark:group-hover:text-slate-300",
                "group-hover:scale-110 group-hover:rotate-90",
                isOpen && "rotate-90 scale-110 text-slate-700 dark:text-slate-300"
              )}
            />
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-80 p-0 rounded-2xl overflow-hidden",
          "bg-white/95 dark:bg-slate-950/95",
          "backdrop-blur-xl",
          "border border-slate-200/80 dark:border-slate-800/80",
          "shadow-2xl shadow-slate-900/10 dark:shadow-black/50",
          "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        )}
        sideOffset={12}
        align="end"
      >
        <div className="flex flex-col h-fit">
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-6">
            {/* Parameters Group */}
            <div className="space-y-3 shrink-0">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Overview
                </span>
              </div>

              {/* Tools Status */}
              <div className="flex w-full items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "relative flex h-5 w-full justify-start overflow-hidden px-2 text-[10px] font-medium select-none",
                    compressionEnabled
                      ? "bg-indigo-50/60 dark:bg-indigo-500/10 border-indigo-200/70 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                      : "bg-slate-50/60 dark:bg-slate-800/50 border-slate-200/70 dark:border-slate-700 text-slate-400"
                  )}
                >
                  {compressionEnabled && (
                    <span
                      className="absolute inset-y-0 left-0 w-full origin-left bg-indigo-200/45 dark:bg-indigo-400/15 transition-transform duration-300"
                      style={{ transform: `scaleX(${compressionProgressWidth / 100})` }}
                    />
                  )}
                  <span className="relative z-10 inline-flex min-w-0 flex-1 items-center">
                    <Compass className="w-3 h-3 mr-1" />
                    <span className='min-w-0 flex-1 truncate space-x-1'>
                      <span>Auto Compact</span>
                      <span className='font-bold'>{compressionEnabled ? 'On' : 'Off'}</span>
                      <span> | {compressionCount}</span>
                      <span className='font-bold'> | {compressionUsagePercent ?? '--'}%</span>
                    </span>
                  </span>
                </Badge>
              </div>

              {/* Chat Stats */}
              <div className="grid grid-cols-3 gap-2 select-none">
                <div className="rounded-lg border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/40 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
                    <TokensIcon className="w-3 h-3" />
                    Tokens
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    {tokenTotal}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/40 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
                    <Wrench className="w-3 h-3" />
                    Tools
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    {toolCallCount} / {toolResultCount}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/40 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
                    <Sparkles className="w-3 h-3" />
                    Skills
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    {activeSkills.length}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ChatStatsPanel
