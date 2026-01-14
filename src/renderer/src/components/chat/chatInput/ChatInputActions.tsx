import { PaperPlaneIcon, StopIcon } from '@radix-ui/react-icons'
import { Button } from '@renderer/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@renderer/components/ui/tooltip"
import { cn } from '@renderer/lib/utils'
import {
  ArrowBigUp,
  BadgePlus,
  CornerDownLeft,
  Package
} from 'lucide-react'
import React from 'react'

interface ChatInputActionsProps {
  readStreamState: boolean
  artifacts: boolean
  onNewChat: () => void
  onArtifactsToggle: () => void
  onSubmit: () => void
  onStop: () => void
}

const ChatInputActions: React.FC<ChatInputActionsProps> = ({
  readStreamState,
  artifacts,
  onNewChat,
  onArtifactsToggle,
  onSubmit,
  onStop
}) => {
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
                onClick={onArtifactsToggle}
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
              className='rounded-full border-[1px] border-gray-300 dark:border-gray-600 hover:bg-gray-600 dark:hover:bg-gray-500'
            >
              <PaperPlaneIcon className="-rotate-45 mb-0.5 ml-0.5 w-8 dark:text-gray-400" />
              <sub className="text-gray-400 dark:text-gray-400 flex">
                <ArrowBigUp className="w-3" />
                <CornerDownLeft className="w-3" />
              </sub>
            </Button>
          ) : (
            <Button
              variant={'destructive'}
              size={'sm'}
              className={cn('rounded-full border-[1px] hover:bg-red-400 dark:hover:bg-red-500 animate-pulse transition-transform duration-800')}
              onClick={onStop}
            >
              <StopIcon />&nbsp;Stop
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInputActions
