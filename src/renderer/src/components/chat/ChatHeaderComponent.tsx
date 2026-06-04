import { ActivityLogIcon, DrawingPinFilledIcon, DrawingPinIcon, GearIcon } from '@radix-ui/react-icons'
import { ModeToggle } from '@renderer/components/mode-toggle'
import SettingsPanel from '@renderer/components/settings/SettingsPanel'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import TrafficLights from '@renderer/components/ui/traffic-lights'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
import { invokePinWindow } from '@renderer/invoker/ipcInvoker'
import { useSheetStore } from '@renderer/store/sheet'
import React, { useState } from 'react'

interface ChatHeaderProps { }

const headerActionButtonClassName = [
  'app-undragable pointer-events-auto h-8 w-8 rounded-lg border border-transparent bg-transparent p-0',
  'text-slate-600 transition-[background-color,border-color,box-shadow,color,transform] duration-200',
  'hover:border-black/[0.08] hover:bg-black/[0.045] hover:text-slate-950 active:scale-95',
  'dark:text-zinc-400 dark:hover:border-white/10 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100'
].join(' ')

const ChatHeaderComponent: React.FC<ChatHeaderProps> = (_props: ChatHeaderProps) => {
  const [pinState, setPinState] = useState<boolean>(false)
  const chatTitle = useChatStore(state => state.chatTitle)
  const { setSheetOpenState } = useSheetStore()

  const onPinToggleClick = (): void => {
    setPinState(!pinState)
    invokePinWindow(!pinState) // pin window
  }

  return (
    <header
      className="header relative z-50 h-10 shrink-0 overflow-visible app-dragable"
      style={{ userSelect: 'none' }}
    >
      <div className="pointer-events-none absolute inset-0 border-b border-black/[0.07] bg-white/50 backdrop-blur-3xl dark:border-white/8" />

      <div className="pointer-events-none relative z-10 grid h-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4">
        <div className="flex min-w-0 items-center gap-4 justify-self-start">
          <div className="app-undragable pointer-events-auto">
            <TrafficLights />
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              className={headerActionButtonClassName}
              variant="ghost"
              onClick={() => { setSheetOpenState(true) }}
            >
              <ActivityLogIcon className="h-4 w-4" />
              <span className="sr-only">Open chat list</span>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  className={headerActionButtonClassName}
                  variant="ghost"
                >
                  <GearIcon className="h-4 w-4" />
                  <span className="sr-only">Open settings</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="app-undragable ml-1 mt-1 w-[716px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-black/8 bg-white/80 p-0 px-2 pt-2 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/80">
                <SettingsPanel />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="min-w-0 justify-self-center px-3">
          <div className="group relative max-w-[min(34rem,42vw)] min-w-0 px-2">
            <span className="block truncate px-3 py-1 text-sm font-semibold text-slate-600 dark:text-zinc-100">
              {chatTitle}
            </span>
            <div className="absolute inset-x-0 bottom-0 h-px origin-center scale-x-75 bg-linear-to-r from-transparent via-blue-400/55 to-transparent opacity-80 transition-transform duration-300 group-hover:scale-x-100 dark:via-sky-300/40" />
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5 justify-self-end">
          <div className="app-undragable pointer-events-auto">
            <ModeToggle triggerClassName={headerActionButtonClassName} />
          </div>
          <Button
            className={cn(
              headerActionButtonClassName,
              pinState && 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
            )}
            variant="ghost"
            onClick={onPinToggleClick}
          >
            {pinState ? (
              <DrawingPinFilledIcon className="h-4 w-4" />
            ) : (
              <DrawingPinIcon className="h-4 w-4" />
            )}
            <span className="sr-only">Toggle always on top</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

export default ChatHeaderComponent
