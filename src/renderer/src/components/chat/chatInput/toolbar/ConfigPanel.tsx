import { TokensIcon } from '@radix-ui/react-icons'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useAssistantStore } from '@renderer/store/assistant'
import React, { useState } from 'react'
import { getChatSkills } from '@renderer/db/ChatSkillRepository'
import { getCompressedSummariesByChatId } from '@renderer/db/CompressedSummaryRepository'
import { Wrench, Sparkles, Database, Compass } from 'lucide-react'
import { getChatFromList } from '@renderer/utils/chatWorkspace'
import { updateChat } from '@renderer/db/ChatRepository'

const ConfigPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const messages = useChatStore(state => state.messages)
  const currentChatId = useChatStore(state => state.currentChatId)
  const currentChatUuid = useChatStore(state => state.currentChatUuid)
  const userInstruction = useChatStore(state => state.userInstruction)
  const setUserInstruction = useChatStore(state => state.setUserInstruction)
  const chatList = useChatStore(state => state.chatList)
  const updateChatList = useChatStore(state => state.updateChatList)
  const { appConfig } = useAppConfigStore()
  const { currentAssistant } = useAssistantStore()
  const [displayAssistant, setDisplayAssistant] = useState<Assistant | null>(null)
  const [isExiting, setIsExiting] = useState(false)
  const [activeSkills, setActiveSkills] = useState<string[]>([])
  const [compressionCount, setCompressionCount] = useState<number>(0)

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
      return
    }
    getChatSkills(currentChatId)
      .then(setActiveSkills)
      .catch(() => setActiveSkills([]))
    getCompressedSummariesByChatId(currentChatId)
      .then(result => setCompressionCount(result.length))
      .catch(() => setCompressionCount(0))
  }, [currentChatId])

  React.useEffect(() => {
    const chat = getChatFromList({ chatId: currentChatId ?? undefined, chatUuid: currentChatUuid ?? undefined, chatList })
    if (chat) {
      setUserInstruction(chat.userInstruction ?? '')
    }
  }, [currentChatId, currentChatUuid, chatList])

  const saveUserInstruction = React.useCallback(async () => {
    if (!currentChatId) return
    const nextValue = userInstruction.trim()
    const chat = getChatFromList({ chatId: currentChatId ?? undefined, chatUuid: currentChatUuid ?? undefined, chatList })
    if (!chat || !chat.id) return
    const currentValue = (chat.userInstruction ?? '').trim()
    if (nextValue === currentValue) {
      return
    }
    const updatedChat: ChatEntity = {
      ...chat,
      userInstruction: nextValue,
      updateTime: Date.now()
    }
    await updateChat(updatedChat)
    updateChatList(updatedChat)
  }, [userInstruction, currentChatId, currentChatUuid, chatList, updateChatList])

  const tokenTotal = React.useMemo(() => {
    return messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0)
  }, [messages])

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

  const memoryCallCount = React.useMemo(() => {
    return messages.reduce((sum, msg) => {
      const segments = msg.body.segments || []
      const memorySegments = segments.filter(seg =>
        seg.type === 'toolCall' &&
        (seg.name === 'memory_retrieval' || seg.name === 'memory_save')
      ).length
      return sum + memorySegments
    }, 0)
  }, [messages])

  const memoryEnabled = appConfig?.tools?.memoryEnabled ?? true
  const compressionEnabled = appConfig?.compression?.enabled ?? true

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      void saveUserInstruction()
    }
    setIsOpen(nextOpen)
  }, [saveUserInstruction])

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div className="relative flex items-center group">
          {/* Assistant Icon - Slides in/out with animation */}
          {displayAssistant?.icon && (
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
                {displayAssistant.icon + ' ' + displayAssistant.name}
              </span>
            </div>
          )}

          {/* Token Button - Connects seamlessly with assistant icon */}
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
              currentAssistant?.icon ? [
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
                  Chat Overview
                </span>
              </div>

              {/* Chat Stats */}
              <div className="grid grid-cols-3 gap-2">
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

              {/* Toggles */}
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] h-5 px-2 font-medium",
                    memoryEnabled
                      ? "bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200/70 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-slate-50/60 dark:bg-slate-800/50 border-slate-200/70 dark:border-slate-700 text-slate-400"
                  )}
                >
                  <Database className="w-3 h-3 mr-1" />
                  Memory {memoryEnabled ? 'On' : 'Off'} · {memoryCallCount}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] h-5 px-2 font-medium",
                    compressionEnabled
                      ? "bg-indigo-50/60 dark:bg-indigo-500/10 border-indigo-200/70 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                      : "bg-slate-50/60 dark:bg-slate-800/50 border-slate-200/70 dark:border-slate-700 text-slate-400"
                  )}
                >
                  <Compass className="w-3 h-3 mr-1" />
                  Compact {compressionEnabled ? 'On' : 'Off'} · {compressionCount}
                </Badge>
              </div>

            </div>

            <div className="space-y-1 flex-1 flex flex-col pt-1 min-h-0">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800/60 shrink-0 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Instructions
                </span>
              </div>

              <Label
                htmlFor="instructions"
                className="sr-only"
              >
                Instructions
              </Label>
              <Textarea
                id="instructions"
                value={userInstruction}
                placeholder='Highest-priority instructions for this chat...'
                className={cn(
                  "flex-1 text-xs leading-relaxed",
                  "bg-slate-50 dark:bg-slate-900/50",
                  "border border-slate-200 dark:border-slate-800",
                  "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
                  "ring-0 focus:ring-0 focus-visible:ring-0",
                  "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                  "focus:border-blue-500/50 dark:focus:border-blue-500/50",
                  "hover:border-slate-200 dark:hover:border-slate-800",
                  "resize-none p-2",
                  "shadow-xs",
                  "min-h-[80px]"
                )}
                onChange={e => setUserInstruction(e.target.value)}
                onBlur={saveUserInstruction}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ConfigPanel
