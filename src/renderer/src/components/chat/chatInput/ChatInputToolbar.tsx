import { cn } from '@renderer/lib/utils'
import { ChatToolbarModelSelector } from '@renderer/components/shared/model-selector'
import { Button } from '@renderer/components/ui/button'
import PermissionApprovalModeSelector from './toolbar/PermissionApprovalModeSelector'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import React from 'react'
import type { ModelOption } from '@renderer/store/appConfig'
import { BadgePlus } from 'lucide-react'

interface ChatInputToolbarProps {
  // Model selector props
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  plugins?: PluginEntity[]
  selectedThinkingLevel?: ThinkingLevel
  permissionApprovalMode: PermissionApprovalMode
  modelMenuCollisionBoundary?: HTMLElement | null
  setSelectedModelRef: (ref: ModelRef) => void
  setSelectedThinkingLevel: (level: ThinkingLevel | undefined) => void
  setPermissionApprovalMode: (mode: PermissionApprovalMode) => void

  // Queue preview
  queuedFirstText?: string
  queuedCount?: number
  queuePaused?: boolean
  onNewChat?: () => void
  onBaselineInteractionStart?: () => void
  onBaselinePopoverOpenChange?: (open: boolean) => void
  variant?: 'default' | 'baseline' | 'surface'
}

const ChatInputToolbar: React.FC<ChatInputToolbarProps> = ({
  selectedModel,
  modelOptions,
  plugins,
  selectedThinkingLevel,
  permissionApprovalMode,
  modelMenuCollisionBoundary,
  setSelectedModelRef,
  setSelectedThinkingLevel,
  setPermissionApprovalMode,
  queuedFirstText,
  queuedCount,
  queuePaused,
  onNewChat,
  onBaselineInteractionStart,
  onBaselinePopoverOpenChange,
  variant = 'default'
}) => {
  const [selectModelPopoutState, setSelectModelPopoutState] = React.useState(false)
  const [queueVisible, setQueueVisible] = React.useState(false)
  const [queueExiting, setQueueExiting] = React.useState(false)

  const handleModelSelect = (ref: ModelRef, thinkingLevel?: ThinkingLevel) => {
    setSelectedModelRef(ref)
    setSelectedThinkingLevel(thinkingLevel)
    setSelectModelPopoutState(false)
    if (variant === 'baseline') {
      onBaselinePopoverOpenChange?.(false)
    }
  }

  const handleModelPopoverOpenChange = (open: boolean) => {
    setSelectModelPopoutState(open)
    if (variant === 'baseline') {
      onBaselinePopoverOpenChange?.(open)
    }
  }

  const queuePreview = React.useMemo(() => {
    if (!queuedFirstText || !queuedFirstText.trim()) {
      return 'Queued media'
    }
    const text = queuedFirstText.trim().replace(/\s+/g, ' ')
    const maxLen = 24
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
  }, [queuedFirstText])

  React.useEffect(() => {
    if (typeof queuedCount === 'number' && queuedCount > 0) {
      setQueueVisible(true)
      setQueueExiting(false)
      return
    }
    if (!queueVisible) {
      return
    }
    setQueueExiting(true)
    const timer = window.setTimeout(() => {
      setQueueVisible(false)
      setQueueExiting(false)
    }, 200)
    return () => window.clearTimeout(timer)
  }, [queuedCount, queueVisible])

  if (variant === 'baseline') {
    return (
      <div
        id="inputSelector"
        className="shared-prompt-toolbar flex min-w-0 items-center gap-2"
      >
        {onNewChat && (
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'shared-prompt-action-button group relative h-8 w-8 shrink-0 overflow-hidden rounded-xl',
                    'bg-slate-50/50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400',
                    'border border-slate-200/50 dark:border-slate-700/50',
                    'transition-all duration-300 ease-out',
                    'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 hover:shadow-xs',
                    'active:scale-95 focus-visible:ring-0 focus-visible:ring-offset-0',
                    'dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300'
                  )}
                  onClick={onNewChat}
                >
                  <BadgePlus className="relative z-10 h-5 w-5 transition-transform duration-300 ease-out group-hover:rotate-90 group-hover:scale-110" strokeWidth={2} />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-slate-600/50 dark:bg-slate-800/95">
                <p className="font-medium">New Chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="flex min-w-0 max-w-[230px] items-center gap-1.5">
          <div
            id="modelSelector"
            className="app-undragable min-w-0 flex-1 bg-transparent"
            onPointerDownCapture={onBaselineInteractionStart}
          >
            <ChatToolbarModelSelector
              selectedModel={selectedModel}
              modelOptions={modelOptions}
              plugins={plugins}
              selectedThinkingLevel={selectedThinkingLevel}
              collisionBoundary={modelMenuCollisionBoundary}
              isOpen={selectModelPopoutState}
              onOpenChange={handleModelPopoverOpenChange}
              onModelSelect={handleModelSelect}
              triggerClassName="w-full min-w-0 max-w-none"
              variant="baseline"
            />
          </div>

          <div className="shrink-0">
            <PermissionApprovalModeSelector
              value={permissionApprovalMode}
              onChange={setPermissionApprovalMode}
              variant="baseline"
            />
          </div>
        </div>

        {queueVisible && queuePreview && (
          <div className={cn(
            'hidden min-w-0 items-center gap-1.5 rounded-full border border-border/25 bg-foreground/[0.025] px-2 py-1 text-[10px] font-medium text-muted-foreground sm:flex',
            queueExiting
              ? 'animate-out fade-out-0 slide-out-to-right-2 duration-200'
              : 'animate-in fade-in-0 slide-in-from-right-2 duration-200'
          )}>
            <span className="h-3 w-px bg-amber-500/45 dark:bg-amber-300/45" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">Queued</span>
            {queuePaused && (
              <span className="text-[9px] font-semibold text-rose-500 dark:text-rose-300">Paused</span>
            )}
            <span className="max-w-[120px] truncate">{queuePreview}</span>
            {queuedCount && queuedCount > 1 && (
              <span className="text-[9px] font-semibold text-muted-foreground/80">+{queuedCount - 1}</span>
            )}
          </div>
        )}
      </div>
    )
  }

  if (variant === 'surface') {
    return (
      <div
        id="inputSelector"
        className="shared-prompt-toolbar flex min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {onNewChat && (
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'shared-prompt-action-button group relative h-8 w-8 shrink-0 overflow-hidden rounded-xl',
                    'bg-slate-50/50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400',
                    'border border-slate-200/50 dark:border-slate-700/50',
                    'transition-all duration-300 ease-out',
                    'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 hover:shadow-xs',
                    'active:scale-95 focus-visible:ring-0 focus-visible:ring-offset-0',
                    'dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300'
                  )}
                  onClick={onNewChat}
                >
                  <BadgePlus className="relative z-10 h-5 w-5 transition-transform duration-300 ease-out group-hover:rotate-90 group-hover:scale-110" strokeWidth={2} />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-slate-600/50 dark:bg-slate-800/95">
                <p className="font-medium">New Chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div
          id="modelSelector"
          className="app-undragable shrink-0 bg-transparent"
        >
          <ChatToolbarModelSelector
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            plugins={plugins}
            selectedThinkingLevel={selectedThinkingLevel}
            collisionBoundary={modelMenuCollisionBoundary}
            isOpen={selectModelPopoutState}
            onOpenChange={handleModelPopoverOpenChange}
            onModelSelect={handleModelSelect}
            variant="baseline"
          />
        </div>

        <PermissionApprovalModeSelector
          value={permissionApprovalMode}
          onChange={setPermissionApprovalMode}
          variant="surface"
        />

        {queueVisible && queuePreview && (
          <div className={cn(
            'hidden min-w-0 items-center gap-1.5 rounded-xl border border-border/25 bg-foreground/[0.025] px-2 py-1 text-[10px] font-medium text-muted-foreground md:flex',
            queueExiting
              ? 'animate-out fade-out-0 slide-out-to-right-2 duration-200'
              : 'animate-in fade-in-0 slide-in-from-right-2 duration-200'
          )}>
            <span className="h-3 w-px bg-amber-500/45 dark:bg-amber-300/45" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">Queued</span>
            {queuePaused && (
              <span className="text-[9px] font-semibold text-rose-500 dark:text-rose-300">Paused</span>
            )}
            <span className="max-w-[140px] truncate">{queuePreview}</span>
            {queuedCount && queuedCount > 1 && (
              <span className="text-[9px] font-semibold text-muted-foreground/80">+{queuedCount - 1}</span>
            )}
          </div>
        )}

      </div>
    )
  }

  return (
    <div
      id="inputSelector"
      className='rounded-t-2xl w-full bg-white/45 dark:bg-zinc-950/30 p-1 flex items-center space-x-2 flex-none h-10 select-none border-b-0 border-t border-l border-r border-blue-gray-200/80 dark:border-gray-700/80'
    >
      {/* Model Selector */}
      <div id="modelSelector" className="app-undragable bg-transparent">
        <ChatToolbarModelSelector
          selectedModel={selectedModel}
          modelOptions={modelOptions}
          plugins={plugins}
          selectedThinkingLevel={selectedThinkingLevel}
          collisionBoundary={modelMenuCollisionBoundary}
          isOpen={selectModelPopoutState}
          onOpenChange={handleModelPopoverOpenChange}
          onModelSelect={handleModelSelect}
          variant="default"
        />
      </div>

      <PermissionApprovalModeSelector
        value={permissionApprovalMode}
        onChange={setPermissionApprovalMode}
        variant="default"
      />

      {/* Config Panel */}
      <div id="customPanel" className='grow w-full bg-transparent'>
        <div className='flex items-center justify-end gap-2 w-auto'>
          {queueVisible && queuePreview && (
            <div className={cn(
              "flex items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 max-w-[240px]",
              queueExiting
                ? "animate-out fade-out-0 slide-out-to-right-2 duration-200"
                : "animate-in fade-in-0 slide-in-from-right-2 duration-200"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70 dark:bg-amber-400/70" />
              <span className="uppercase tracking-wider text-[9px] text-slate-500 dark:text-slate-400">Queued</span>
              {queuePaused && (
                <span className="text-[9px] font-bold text-rose-500 dark:text-rose-400">Paused</span>
              )}
              <span className="truncate">{queuePreview}</span>
              {queuedCount && queuedCount > 1 && (
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">+{queuedCount - 1}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInputToolbar
