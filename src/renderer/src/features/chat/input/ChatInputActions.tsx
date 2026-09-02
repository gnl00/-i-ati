import { PaperPlaneIcon, StopIcon } from '@radix-ui/react-icons'
import { Button } from '@renderer/shared/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@renderer/shared/components/ui/tooltip"
import { cn } from '@renderer/shared/lib/utils'
import { useChatStore, type RunPhase } from '@renderer/features/chat/state/chatStore'
import { invokeSelectDirectory } from '@renderer/infrastructure/ipc'
import { getChatFromList, getChatWorkspacePath } from '@renderer/features/chat/chatWorkspace'
import { saveChat } from '@renderer/infrastructure/persistence/ChatRepository'
import { getDefaultWorkspacePath } from '@shared/workspace/workspacePaths'
import { v4 as uuidv4 } from 'uuid'
import {
  BadgePlus,
  CornerDownLeft,
  FolderOpen
} from 'lucide-react'
import React, { useMemo, useEffect } from 'react'
import { toast } from 'sonner'

interface ChatInputActionsProps {
  runPhase: RunPhase
  onNewChat: () => void
  onSubmit: () => void
  onCancel?: () => void
  workspacePathToSelect?: string | null
  variant?: 'default' | 'baseline' | 'surface'
  submitDisabled?: boolean
}

const ChatInputActions: React.FC<ChatInputActionsProps> = ({
  runPhase,
  onNewChat,
  onSubmit,
  onCancel,
  workspacePathToSelect,
  variant = 'default',
  submitDisabled = false
}) => {
  const canCancelRun = runPhase === 'submitting' || runPhase === 'streaming'
  const isCancelling = runPhase === 'cancelling'
  const messages = useChatStore(state => state.messages)
  const chatId = useChatStore(state => state.currentChatId)
  const chatUuid = useChatStore(state => state.currentChatUuid)
  const chatList = useChatStore(state => state.chatList)
  const prependChatListEntry = useChatStore(state => state.prependChatListEntry)
  const selectChatShell = useChatStore(state => state.selectChatShell)
  const updateWorkspacePath = useChatStore(state => state.updateWorkspacePath)
  const currentWorkspacePath = useMemo(() => {
    return getChatWorkspacePath({ chatUuid: chatUuid ?? undefined, chatId: chatId ?? undefined, chatList })
  }, [chatUuid, chatId, chatList])
  const isCustomWorkspace = useMemo(() => {
    if (!currentWorkspacePath || !chatUuid) return false
    const normalizedPath = currentWorkspacePath.replace(/\\/g, '/')
    const defaultSuffixes = [`/workspaces/${chatUuid}`, `workspaces/${chatUuid}`]
    const isDefaultPath = defaultSuffixes.some(suffix => normalizedPath.endsWith(suffix))
    return !isDefaultPath
  }, [currentWorkspacePath, chatUuid])

  // 获取目录名（路径的最后一部分）
  const getDirectoryName = (path: string | undefined): string => {
    if (!path) return 'Workspace'
    const parts = path.split(/[/\\]/).filter(p => p) // 过滤空字符串
    return parts[parts.length - 1] || 'Workspace'
  }

  // 优化的 New Chat 处理逻辑
  const handleNewChat = async () => {
    // 如果当前 chat 存在且没有任何消息，直接清空 workspace 复用当前 chat
    if (chatId && chatUuid && messages.length === 0) {
      const currentChat = getChatFromList({ chatId, chatList })
      if (currentChat && currentChat.workspacePath) {
        await updateWorkspacePath(getDefaultWorkspacePath(chatUuid))
        // toast.success('Workspace cleared')
        return
      }
    }

    // 否则，调用原始的 onNewChat 创建新 chat
    onNewChat()
  }

  const handleWorkspaceSelect = async (directPath?: string) => {
    try {
      let selectedPath = directPath

      // If no direct path provided, show directory picker
      if (!selectedPath) {
        const result = await invokeSelectDirectory()
        if (!result.success || !result.path) {
          return
        }
        selectedPath = result.path
      }

      // If current no chat, initialize a new chat first
      if (!chatId && !chatUuid) {
        const newChatUuid = uuidv4()
        const newChatEntity: ChatEntity = {
          uuid: newChatUuid,
          title: 'NewChat',
          messages: [],
          workspacePath: selectedPath,
          createTime: Date.now(),
          updateTime: Date.now()
        }

        const newChatId = await saveChat(newChatEntity)

        // 添加新 chat 到 chatList
        newChatEntity.id = newChatId
        prependChatListEntry(newChatEntity)

        // 然后更新当前 chat shell
        selectChatShell(newChatId, newChatUuid, newChatEntity)

        // toast.success(`New chat created with workspace: ${selectedPath}`)
      } else {
        // 更新现有 chat 的 workspacePath
        const currentChat = getChatFromList({ chatId: chatId ?? undefined, chatList })
        if (currentChat) {
          await updateWorkspacePath(selectedPath)
          // toast.success(`Workspace updated: ${selectedPath}`)
        }
      }
    } catch (error) {
      console.error('[Workspace] Failed to select directory:', error)
      toast.error('Failed to select workspace')
    }
  }

  // Watch for workspace path changes from drag and drop
  useEffect(() => {
    if (workspacePathToSelect) {
      handleWorkspaceSelect(workspacePathToSelect)
    }
  }, [workspacePathToSelect])

  const handleStopClick = () => {
    if (onCancel) {
      onCancel()
    } else {
      toast.error('Failed to stop request')
    }
  }

  if (variant === 'surface') {
    return (
      <div className="shared-prompt-action-strip flex min-w-0 items-center justify-end gap-1.5">
        <TooltipProvider delayDuration={350}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                aria-label="Select workspace"
                className={cn(
                  'shared-prompt-action-button flex h-8 max-w-[148px] items-center gap-1.5 overflow-hidden rounded-[10px] border px-2.5',
                  'transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98]',
                  isCustomWorkspace
                    ? [
                        'border-blue-200/75 bg-blue-50/65 text-blue-700 hover:border-blue-300/80 hover:bg-blue-100/70',
                        'dark:border-(--chat-border-standard) dark:bg-(--chat-surface-hover) dark:text-(--chat-accent-strong)',
                        'dark:hover:border-(--chat-accent) dark:hover:bg-(--chat-surface-hover) dark:hover:text-(--chat-text-primary)'
                      ]
                    : [
                        'border-slate-200/45 bg-white/35 text-slate-500 hover:border-slate-300/65 hover:bg-slate-50/80 hover:text-slate-700',
                        'dark:border-(--chat-border-subtle) dark:bg-(--chat-surface) dark:text-(--chat-text-secondary)',
                        'dark:hover:border-(--chat-border-standard) dark:hover:bg-(--chat-surface-hover) dark:hover:text-(--chat-text-primary)'
                      ]
                )}
                onClick={() => { void handleWorkspaceSelect() }}
              >
                <FolderOpen className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="max-w-[92px] truncate text-[10.5px] font-medium select-none">
                  {isCustomWorkspace ? getDirectoryName(currentWorkspacePath) : 'Workspace'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-slate-600/50 dark:bg-slate-800/95">
              <p className="max-w-72 break-words font-medium">
                {isCustomWorkspace ? currentWorkspacePath : 'Select Workspace'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {!canCancelRun && !isCancelling ? (
          <TooltipProvider delayDuration={350}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex h-8 w-[88px] shrink-0">
                  <Button
                    onClick={onSubmit}
                    variant="default"
                    disabled={submitDisabled}
                    aria-label="Send message"
                    className={cn(
                      'shared-prompt-action-button h-8 w-[88px] min-w-[88px] gap-2 rounded-[10px] border px-3',
                      'border-slate-600/70 bg-slate-700 text-white shadow-none',
                      'transition-[background-color,border-color,color,transform] duration-150 ease-out',
                      'hover:border-slate-500 hover:bg-slate-600 active:scale-[0.97]',
                      'dark:border-(--chat-border-standard) dark:bg-(--chat-accent) dark:text-(--chat-canvas)',
                      'dark:hover:border-(--chat-accent-strong) dark:hover:bg-(--chat-accent-strong)',
                      'disabled:pointer-events-none disabled:border-slate-200/50 disabled:bg-slate-100/65 disabled:text-slate-400 disabled:opacity-100',
                      'dark:disabled:border-(--chat-border-subtle) dark:disabled:bg-(--chat-surface) dark:disabled:text-(--chat-text-muted)'
                    )}
                  >
                    <PaperPlaneIcon className="h-4 w-4 -rotate-45" />
                    <span className="text-[11px] font-semibold leading-none select-none">Send</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-slate-600/50 dark:bg-slate-800/95">
                <p className="font-medium">Enter To Send</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <TooltipProvider delayDuration={350}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex h-8 w-[88px] shrink-0">
                  <Button
                    variant="ghost"
                    disabled={isCancelling}
                    aria-label={isCancelling ? 'Stopping response' : 'Stop response'}
                    className={cn(
                      'shared-prompt-action-button h-8 w-[88px] min-w-[88px] gap-2 rounded-[10px] border px-3 shadow-none',
                      'border-red-200/80 bg-red-50/75 text-red-600',
                      'transition-[background-color,border-color,color,transform] duration-150 ease-out',
                      !isCancelling && 'hover:border-red-300 hover:bg-red-100/80 hover:text-red-700 active:scale-[0.97]',
                      'dark:border-red-900/55 dark:bg-red-950/35 dark:text-red-300',
                      !isCancelling && 'dark:hover:border-red-800/70 dark:hover:bg-red-950/55 dark:hover:text-red-200',
                      isCancelling && 'cursor-wait opacity-60'
                    )}
                    onClick={handleStopClick}
                  >
                    <StopIcon className="h-4 w-4" />
                    <span className="text-[11px] font-semibold leading-none">
                      {isCancelling ? 'Stopping' : 'Stop'}
                    </span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-slate-600/50 dark:bg-slate-800/95">
                <p className="font-medium">{isCancelling ? 'Stopping response' : 'Stop response'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    )
  }

  if (variant === 'baseline') {
    return (
      <div className="shared-prompt-action-strip flex min-w-0 items-center justify-end gap-1">
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'shared-prompt-action-button group relative flex h-8 max-w-[132px] items-center gap-1.5 overflow-hidden rounded-xl px-2.5',
                  'transition-all duration-300 ease-out',
                  isCustomWorkspace
                    ? [
                        'bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/40',
                        'text-blue-700 dark:text-blue-300',
                        'border border-blue-300/60 dark:border-blue-700/60',
                        'shadow-xs shadow-blue-500/10 dark:shadow-blue-500/20',
                        'hover:shadow-sm hover:shadow-blue-500/25 dark:hover:shadow-blue-500/35',
                        'hover:text-blue-500',
                        'active:scale-[0.98] active:brightness-95',
                        'dark:border-(--app-border-standard) dark:bg-(--app-surface-hover) dark:bg-none dark:text-(--app-accent-strong) dark:shadow-none',
                        'dark:hover:border-(--app-accent) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary) dark:hover:shadow-none'
                      ]
                    : [
                        'bg-slate-50/50 dark:bg-slate-800/50',
                        'text-slate-500 dark:text-slate-400',
                        'border border-slate-200/50 dark:border-slate-700/50',
                        'hover:bg-slate-100 dark:hover:bg-slate-700',
                        'hover:text-slate-700 dark:hover:text-slate-300',
                        'hover:border-slate-300 dark:hover:border-slate-600',
                        'hover:shadow-xs',
                        'active:scale-[0.98]',
                        'dark:border-(--app-border-subtle) dark:bg-(--app-surface) dark:text-(--app-text-secondary)',
                        'dark:hover:border-(--app-border-standard) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary) dark:hover:shadow-none'
                      ]
                )}
                onClick={_ => {handleWorkspaceSelect()}}
              >
                {isCustomWorkspace && (
                  <div className="absolute inset-0 bg-linear-to-r from-blue-100/0 via-blue-100/50 to-blue-200/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-blue-900/0 dark:via-blue-900/30 dark:to-blue-900/0" />
                )}
                <FolderOpen className="relative z-10 h-4 w-4 shrink-0 transition-transform duration-300 ease-out group-hover:scale-110" strokeWidth={2} />
                <span className="relative z-10 max-w-[78px] truncate text-[10px] font-medium transition-all duration-300 ease-out select-none">
                  {isCustomWorkspace ? getDirectoryName(currentWorkspacePath) : 'Workspace'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-primary) dark:backdrop-blur-none">
              <p className="font-medium">
                {isCustomWorkspace ? currentWorkspacePath : 'Select Workspace'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {!canCancelRun && !isCancelling ? (
          <Button
            onClick={onSubmit}
            variant="default"
            disabled={submitDisabled}
            className={cn(
              'shared-prompt-action-button group relative h-8 min-w-[82px] overflow-hidden rounded-xl px-3.5',
              'border border-slate-600/50 bg-linear-to-br from-slate-700 to-slate-800 shadow-lg shadow-slate-500/20',
              'transition-all duration-300 ease-out',
              'hover:scale-105 hover:shadow-xl hover:shadow-slate-500/30 active:scale-95',
              'dark:border-(--app-border-standard) dark:bg-(--app-accent) dark:bg-none dark:text-(--app-canvas) dark:shadow-none',
              'dark:hover:border-(--app-accent-strong) dark:hover:bg-(--app-accent-strong) dark:hover:shadow-none',
              'disabled:pointer-events-none disabled:opacity-[0.24]'
            )}
          >
            <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
            <div className="relative flex items-center gap-1.5">
              <PaperPlaneIcon className="h-4 w-4 -rotate-45 text-white transition-transform duration-300 group-hover:scale-105" />
              <sub className="flex items-center gap-0.5 text-[9px] text-white/70">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </sub>
            </div>
          </Button>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            disabled={isCancelling}
            className={cn(
              'shared-prompt-action-button group relative h-8 min-w-[82px] overflow-hidden rounded-xl px-3.5',
              'border border-red-400/50 bg-linear-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/25',
              'transition-all duration-300 ease-out dark:border-red-500/50 dark:from-red-600 dark:to-red-700 dark:shadow-red-600/30',
              !isCancelling && 'hover:scale-105 hover:shadow-xl hover:shadow-red-500/40 active:scale-95 dark:hover:shadow-red-600/50',
              isCancelling && 'cursor-wait opacity-75'
            )}
            onClick={handleStopClick}
          >
            {!isCancelling && (
              <div className="absolute inset-0 animate-[pulse_1.5s_ease-in-out_infinite] bg-red-400/20" />
            )}
            <div className="relative flex items-center gap-1.5">
              <StopIcon className="h-4 w-4 text-white transition-transform duration-200 group-hover:scale-110" />
              <span className="text-xs font-medium text-white">{isCancelling ? 'Stopping' : 'Stop'}</span>
            </div>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      id="inputAreaBottom"
      className="rounded-b-2xl z-10 w-full bg-white/45 dark:bg-zinc-950/30 p-1 pl-2 flex border-b border-l border-r border-blue-gray-200/80 dark:border-gray-700/80 flex-none h-10"
    >
      <div className='grow flex items-center space-x-2 select-none relative'>
        {/* New Chat Button */}
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "group relative h-8 w-8 rounded-xl overflow-hidden",
                  "transition-all duration-300 ease-out",
                  "bg-slate-50/50 dark:bg-slate-800/50",
                  "text-slate-500 dark:text-slate-400",
                  "border border-slate-200/50 dark:border-slate-700/50",
                  "hover:bg-slate-100 dark:hover:bg-slate-700",
                  "hover:text-slate-700 dark:hover:text-slate-300",
                  "hover:border-slate-300 dark:hover:border-slate-600",
                  "hover:shadow-xs",
                  "active:scale-95"
                )}
                onClick={handleNewChat}
              >
                <BadgePlus
                  className="w-5 h-5 relative z-10 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-90"
                  strokeWidth={2}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 dark:border-slate-600/50 text-slate-100 text-xs px-3 py-1.5 rounded-lg shadow-xl shadow-black/20">
              <p className="font-medium">New Chat</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Workspace Selection Button */}
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "group relative h-8 px-2.5 rounded-xl flex items-center gap-1.5 overflow-hidden",
                  "transition-all duration-300 ease-out",
                  isCustomWorkspace
                    ? [
                        // Selected state - sky/blue gradient
                        "bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/40",
                        "text-blue-700 dark:text-blue-300",
                        "border border-blue-300/60 dark:border-blue-700/60",
                        "shadow-xs shadow-blue-500/10 dark:shadow-blue-500/20",
                        "hover:shadow-sm hover:shadow-blue-500/25 dark:hover:shadow-blue-500/35",
                        // "hover:brightness-105",
                        "hover:text-blue-500",
                        "active:scale-[0.98] active:brightness-95"
                      ]
                    : [
                        // Unselected state - subtle gray
                        "bg-slate-50/50 dark:bg-slate-800/50",
                        "text-slate-500 dark:text-slate-400",
                        "border border-slate-200/50 dark:border-slate-700/50",
                        "hover:bg-slate-100 dark:hover:bg-slate-700",
                        "hover:text-slate-700 dark:hover:text-slate-300",
                        "hover:border-slate-300 dark:hover:border-slate-600",
                        "hover:shadow-xs",
                        "active:scale-[0.98]"
                      ]
                )}
                onClick={_ => {handleWorkspaceSelect()}}
              >
                {/* Animated background gradient on hover */}
                {isCustomWorkspace && (
                  <div className="absolute inset-0 bg-linear-to-r from-blue-100/0 via-blue-100/50 to-blue-200/0 dark:from-blue-900/0 dark:via-blue-900/30 dark:to-blue-900/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                )}

                {/* Icon with smooth scale animation */}
                <FolderOpen
                  className={cn(
                    "relative z-10 w-4 h-4 transition-transform duration-300 ease-out",
                    isCustomWorkspace
                      ? "group-hover:scale-110"
                      : "group-hover:scale-105"
                  )}
                  strokeWidth={2}
                />

                {/* Text with smooth transition */}
                <span
                  className={cn(
                    "relative z-10 text-[10px] font-medium max-w-[100px] truncate",
                    "transition-all duration-300 ease-out"
                  )}
                >
                  {isCustomWorkspace ? getDirectoryName(currentWorkspacePath) : 'Workspace'}
                </span>
              </Button>
            </TooltipTrigger>

            <TooltipContent
              className={cn(
                "bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xl",
                "border border-slate-700/50 dark:border-slate-600/50",
                "text-slate-100 text-xs px-3 py-1.5 rounded-lg",
                "shadow-xl shadow-black/20"
              )}
            >
              <p className="font-medium">
                {isCustomWorkspace ? currentWorkspacePath : 'Select Workspace'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Submit/Stop Button */}
        <div className='absolute right-0 bottom-0'>
          {!canCancelRun && !isCancelling ? (
            <Button
              onClick={onSubmit}
              variant={'default'}
              size={'sm'}
              className={cn(
                'group relative rounded-full h-8 px-3',
                'bg-linear-to-br from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700',
                'border border-slate-600/50 dark:border-slate-500/50',
                'shadow-lg shadow-slate-500/20 dark:shadow-slate-600/25',
                'hover:shadow-xl hover:shadow-slate-500/30 dark:hover:shadow-slate-600/40',
                'hover:scale-105 active:scale-95',
                'transition-all duration-300 ease-out',
                'overflow-hidden'
              )}
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />

              {/* Icon and shortcuts */}
              <div className="relative flex items-center gap-1.5">
                <PaperPlaneIcon className="w-4 h-4 text-white -rotate-45 group-hover:scale-105 transition-transform duration-300" />
                <sub className="text-white/80 flex items-center gap-0.5 text-[10px]">
                  <CornerDownLeft className="w-2.5 h-2.5" />
                </sub>
              </div>
            </Button>
          ) : (
            <Button
              variant={'destructive'}
              size={'sm'}
              disabled={isCancelling}
              className={cn(
                'group relative rounded-full h-8 px-3',
                'bg-linear-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700',
                'border border-red-400/50 dark:border-red-500/50',
                'shadow-lg shadow-red-500/25 dark:shadow-red-600/30',
                !isCancelling && 'hover:shadow-xl hover:shadow-red-500/40 dark:hover:shadow-red-600/50 hover:scale-105 active:scale-95',
                'transition-all duration-300 ease-out',
                'overflow-hidden',
                !isCancelling && 'animate-[breathe_2s_ease-in-out_infinite]',
                isCancelling && 'cursor-wait opacity-75'
              )}
              onClick={handleStopClick}
              style={{
                animation: isCancelling ? 'none' : 'breathe 2s ease-in-out infinite'
              }}
            >
              {/* Pulsing glow effect */}
              {!isCancelling && (
                <div className="absolute inset-0 bg-red-400/20 animate-[pulse_1.5s_ease-in-out_infinite]" />
              )}

              {/* Icon and text */}
              <div className="relative flex items-center gap-1.5">
                <StopIcon className="w-4 h-4 text-white group-hover:scale-110 transition-transform duration-200" />
                <span className="text-white text-xs font-medium">{isCancelling ? 'Stopping' : 'Stop'}</span>
              </div>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInputActions
