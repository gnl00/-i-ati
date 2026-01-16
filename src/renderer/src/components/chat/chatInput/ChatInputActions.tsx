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
import {
  ArrowBigUp,
  BadgePlus,
  CornerDownLeft,
  Package
} from 'lucide-react'
import React from 'react'
import { toast } from 'sonner'

interface ChatInputActionsProps {
  artifacts: boolean
  currentReqCtrl: AbortController | undefined
  toggleArtifacts: (state: boolean) => void
  setArtifactsPanel: (open: boolean) => void
  onNewChat: () => void
  onSubmit: () => void
}

const ChatInputActions: React.FC<ChatInputActionsProps> = ({
  artifacts,
  currentReqCtrl,
  toggleArtifacts,
  setArtifactsPanel,
  onNewChat,
  onSubmit
}) => {
  const readStreamState = useChatStore(state => state.readStreamState)

  const handleArtifactsToggle = () => {
    const newState = !artifacts
    toggleArtifacts(newState)
    setArtifactsPanel(newState)
  }

  const handleStopClick = () => {
    // console.log('[onStopClick] Triggered, currentReqCtrl:', currentReqCtrl)

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
                className="h-8 w-8 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
                onClick={onNewChat}
              >
                <BadgePlus className='w-5 h-5' strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-black/80 backdrop-blur-md border-0 text-gray-100 text-xs px-2 py-1 rounded-md mb-2">
              <p>New Chat</p>
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
                  "h-8 w-8 rounded-xl transition-all duration-200",
                  artifacts
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 hover:bg-blue-200 hover:text-blue-400 dark:hover:bg-blue-900/60"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
                onClick={handleArtifactsToggle}
              >
                <Package className="w-5 h-5" strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-black/80 backdrop-blur-md border-0 text-gray-100 text-xs px-2 py-1 rounded-md mb-2">
              <p>Artifacts {artifacts ? 'On' : 'Off'}</p>
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
