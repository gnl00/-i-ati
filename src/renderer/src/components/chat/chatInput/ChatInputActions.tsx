import { PaperPlaneIcon, StopIcon } from '@radix-ui/react-icons'
import { Button } from '@renderer/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@renderer/components/ui/tooltip"
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { useAssistantStore } from '@renderer/store/assistant'
import { invokeSelectDirectory } from '@renderer/invoker/ipcInvoker'
import { useChatContext } from '@renderer/context/ChatContext'
import { getChatFromList, getChatWorkspacePath } from '@renderer/utils/chatWorkspace'
import { saveChat } from '@renderer/db/ChatRepository'
import { v4 as uuidv4 } from 'uuid'
import {
  ArrowBigUp,
  BadgePlus,
  CornerDownLeft,
  Package,
  FolderOpen
} from 'lucide-react'
import React, { useMemo } from 'react'
import { toast } from 'sonner'

interface ChatInputActionsProps {
  artifacts: boolean
  currentReqCtrl: AbortController | undefined
  toggleArtifacts: (state: boolean) => void
  setArtifactsPanel: (open: boolean) => void
  onNewChat: () => void
  onSubmit: () => void
  onCancel?: () => void
}

const ChatInputActions: React.FC<ChatInputActionsProps> = ({
  artifacts,
  currentReqCtrl,
  toggleArtifacts,
  setArtifactsPanel,
  onNewChat,
  onSubmit,
  onCancel
}) => {
  const readStreamState = useChatStore(state => state.readStreamState)
  const messages = useChatStore(state => state.messages)
  const { setCurrentAssistant } = useAssistantStore()
  const {
    chatId,
    chatUuid,
    chatList,
    setChatId,
    setChatUuid,
    setChatTitle,
    setChatList,
    updateWorkspacePath
  } = useChatContext()
  const currentWorkspacePath = useMemo(() => {
    return getChatWorkspacePath({ chatUuid, chatId, chatList })
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

  const handleArtifactsToggle = () => {
    const newState = !artifacts
    toggleArtifacts(newState)
    setArtifactsPanel(newState)
  }

  // 优化的 New Chat 处理逻辑
  const handleNewChat = async () => {
    // 清空 currentAssistant
    setCurrentAssistant(null)

    // 如果当前 chat 存在且没有任何消息，直接清空 workspace 复用当前 chat
    if (chatId && chatUuid && messages.length === 0) {
      const currentChat = getChatFromList({ chatId, chatList })
      if (currentChat && currentChat.workspacePath) {
        await updateWorkspacePath(undefined)
        toast.success('Workspace cleared')
        return
      }
    }

    // 否则，调用原始的 onNewChat 创建新 chat
    onNewChat()
  }

  const handleWorkspaceSelect = async () => {
    try {
      const result = await invokeSelectDirectory()

      if (result.success && result.path) {
        // 如果当前没有 chat，先初始化一个新 chat
        if (!chatId && !chatUuid) {
          const newChatUuid = uuidv4()
          const newChatEntity: ChatEntity = {
            uuid: newChatUuid,
            title: 'NewChat',
            messages: [],
            workspacePath: result.path,
            createTime: Date.now(),
            updateTime: Date.now()
          }

          const newChatId = await saveChat(newChatEntity)

          // 添加新 chat 到 chatList
          newChatEntity.id = newChatId
          setChatList([newChatEntity, ...chatList])

          // 然后更新状态
          setChatId(newChatId)
          setChatUuid(newChatUuid)
          setChatTitle('NewChat')

          // toast.success(`New chat created with workspace: ${result.path}`)
        } else {
          // 更新现有 chat 的 workspacePath
          const currentChat = getChatFromList({ chatId, chatList })
          if (currentChat) {
            await updateWorkspacePath(result.path)
            toast.success(`Workspace updated: ${result.path}`)
          }
        }
      }
    } catch (error) {
      console.error('[Workspace] Failed to select directory:', error)
      toast.error('Failed to select workspace')
    }
  }

  const handleStopClick = () => {
    // console.log('[onStopClick] Triggered, currentReqCtrl:', currentReqCtrl)

    if (onCancel) {
      onCancel()
      return
    }

    if (!currentReqCtrl) {
      return
    }

    try {
      currentReqCtrl.abort()
    } catch (error) {
      toast.error('Failed to stop request')
    }
  }
  return (
    <div
      id="inputAreaBottom"
      className="rounded-b-2xl z-10 w-full bg-[#F9FAFB] dark:bg-gray-800 p-1 pl-2 flex border-b-[1px] border-l-[1px] border-r-[1px] border-blue-gray-200 dark:border-gray-700 flex-none h-10"
    >
      <div className='flex-grow flex items-center space-x-2 select-none relative'>
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
                  "hover:shadow-sm",
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

        {/* Artifacts Toggle Button */}
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "group relative h-8 w-8 rounded-xl overflow-hidden",
                  "transition-all duration-300 ease-out",
                  artifacts
                    ? [
                        // Active state - purple/violet gradient
                        "bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/40",
                        "text-purple-700 dark:text-purple-400",
                        "border border-purple-300/60 dark:border-purple-700/60",
                        "shadow-sm shadow-purple-500/10 dark:shadow-purple-500/20",
                        "hover:shadow hover:shadow-purple-500/25 dark:hover:shadow-purple-500/35",
                        "hover:text-purple-500",
                        "active:scale-95"
                      ]
                    : [
                        // Inactive state - subtle gray
                        "bg-slate-50/50 dark:bg-slate-800/50",
                        "text-slate-500 dark:text-slate-400",
                        "border border-slate-200/50 dark:border-slate-700/50",
                        "hover:bg-slate-100 dark:hover:bg-slate-700",
                        "hover:text-slate-700 dark:hover:text-slate-300",
                        "hover:border-slate-300 dark:hover:border-slate-600",
                        "hover:shadow-sm",
                        "active:scale-95"
                      ]
                )}
                onClick={handleArtifactsToggle}
              >
                {/* Animated background gradient on hover (active state only) */}
                {artifacts && (
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-100/0 via-purple-100/50 to-violet-100/0 dark:from-purple-900/0 dark:via-purple-900/30 dark:to-violet-900/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                )}

                <Package
                  className={cn(
                    "w-5 h-5 relative z-10 transition-transform duration-300 ease-out",
                    artifacts
                      ? "group-hover:scale-110 group-hover:rotate-12"
                      : "group-hover:scale-110"
                  )}
                  strokeWidth={2}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 dark:border-slate-600/50 text-slate-100 text-xs px-3 py-1.5 rounded-lg shadow-xl shadow-black/20">
              <p className="font-medium">Artifacts {artifacts ? 'On' : 'Off'}</p>
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
                        "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/40",
                        "text-blue-700 dark:text-blue-300",
                        "border border-blue-300/60 dark:border-blue-700/60",
                        "shadow-sm shadow-blue-500/10 dark:shadow-blue-500/20",
                        "hover:shadow hover:shadow-blue-500/25 dark:hover:shadow-blue-500/35",
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
                        "hover:shadow-sm",
                        "active:scale-[0.98]"
                      ]
                )}
                onClick={handleWorkspaceSelect}
              >
                {/* Animated background gradient on hover */}
                {isCustomWorkspace && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-100/0 via-blue-100/50 to-blue-200/0 dark:from-blue-900/0 dark:via-blue-900/30 dark:to-blue-900/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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
                    "relative z-10 text-xs font-medium max-w-[100px] truncate",
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
          {!readStreamState ? (
            <Button
              onClick={onSubmit}
              variant={'default'}
              size={'sm'}
              className={cn(
                'group relative rounded-full h-8 px-3',
                'bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700',
                'border border-slate-600/50 dark:border-slate-500/50',
                'shadow-lg shadow-slate-500/20 dark:shadow-slate-600/25',
                'hover:shadow-xl hover:shadow-slate-500/30 dark:hover:shadow-slate-600/40',
                'hover:scale-105 active:scale-95',
                'transition-all duration-300 ease-out',
                'overflow-hidden'
              )}
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />

              {/* Icon and shortcuts */}
              <div className="relative flex items-center gap-1.5">
                <PaperPlaneIcon className="w-4 h-4 text-white -rotate-45 group-hover:scale-105 transition-transform duration-300" />
                <sub className="text-white/80 flex items-center gap-0.5 text-[10px]">
                  <ArrowBigUp className="w-2.5 h-2.5" />
                  <CornerDownLeft className="w-2.5 h-2.5" />
                </sub>
              </div>
            </Button>
          ) : (
            <Button
              variant={'destructive'}
              size={'sm'}
              className={cn(
                'group relative rounded-full h-8 px-3',
                'bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700',
                'border border-red-400/50 dark:border-red-500/50',
                'shadow-lg shadow-red-500/25 dark:shadow-red-600/30',
                'hover:shadow-xl hover:shadow-red-500/40 dark:hover:shadow-red-600/50',
                'hover:scale-105 active:scale-95',
                'transition-all duration-300 ease-out',
                'overflow-hidden',
                'animate-[breathe_2s_ease-in-out_infinite]'
              )}
              onClick={handleStopClick}
              style={{
                animation: 'breathe 2s ease-in-out infinite'
              }}
            >
              {/* Pulsing glow effect */}
              <div className="absolute inset-0 bg-red-400/20 animate-[pulse_1.5s_ease-in-out_infinite]" />

              {/* Icon and text */}
              <div className="relative flex items-center gap-1.5">
                <StopIcon className="w-4 h-4 text-white group-hover:scale-110 transition-transform duration-200" />
                <span className="text-white text-xs font-medium">Stop</span>
              </div>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInputActions
