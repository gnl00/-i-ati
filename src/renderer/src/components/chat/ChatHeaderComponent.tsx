import { ActivityLogIcon, DrawingPinFilledIcon, DrawingPinIcon, GearIcon } from '@radix-ui/react-icons'
import { ModeToggle } from '@renderer/components/mode-toggle'
import SettingsPanel from '@renderer/components/settings/SettingsPanel'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import TrafficLights from '@renderer/components/ui/traffic-lights'
import { useChatStore } from '@renderer/store'
import { invokePinWindow } from '@renderer/invoker/ipcInvoker'
import { useSheetStore } from '@renderer/store/sheet'
import React, { useState } from 'react'

interface ChatHeaderProps { }

const ChatHeaderComponent: React.FC<ChatHeaderProps> = (_props: ChatHeaderProps) => {
  const [pinState, setPinState] = useState<boolean>(false)
  const chatTitle = useChatStore(state => state.chatTitle)
  const { setSheetOpenState } = useSheetStore()

  const onPinToggleClick = (): void => {
    setPinState(!pinState)
    invokePinWindow(!pinState) // pin window
  }

  return (
    <div
      className="header fixed top-0 w-full px-4 py-1.5 flex items-center justify-between app-dragable bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-zinc-800/50 z-10 transition-colors duration-200"
      style={{ userSelect: 'none' }}
    >
      {/* macOS Traffic Lights */}
      <div className="flex items-center gap-4">
        <TrafficLights />
        <div className="app-dragable flex gap-1.5">
          <Button
            className="app-undragable h-8 w-8 p-0 rounded-lg bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800/80 transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-zinc-700"
            variant="ghost"
            onClick={__ => { setSheetOpenState(true) }}
          >
            <ActivityLogIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </Button>
          <Popover>
            <PopoverTrigger asChild className="app-undragable">
              <Button
                className="h-8 w-8 p-0 rounded-lg bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800/80 transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-zinc-700"
                variant="ghost"
              >
                <GearIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="ml-1 mt-1 p-0 pt-2 px-2 app-undragable w-auto h-full">
              <SettingsPanel />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Center Title */}
      <div className='app-dragable flex-1 flex justify-center items-center'>
        <div className='relative group'>
          <span className='text-gray-700 dark:text-gray-200 font-semibold text-sm truncate max-w-md px-3 py-1 block'>
            {chatTitle}
          </span>
          {/* Animated gradient underline */}
          <div className='absolute bottom-0 left-0 right-0 h-0.5 bg-linear-to-r from-transparent via-blue-500/60 to-transparent transform scale-x-75 group-hover:scale-x-100 transition-transform duration-300' />
        </div>
      </div>

      {/* Right Controls */}
      <div className="app-dragable flex justify-end gap-1.5">
        <div className="app-undragable"><ModeToggle /></div>
        <Button
          className="app-undragable h-8 w-8 p-0 rounded-lg bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800/80 transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-zinc-700"
          variant="ghost"
          onClick={onPinToggleClick}
        >
          {pinState ? (
            <DrawingPinFilledIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <DrawingPinIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          )}
        </Button>
      </div>
    </div>
  )
}

export default ChatHeaderComponent
