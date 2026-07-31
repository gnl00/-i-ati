import { ActivityLogIcon, GearIcon } from '@radix-ui/react-icons'
import { ModeToggleSlide } from '@renderer/shared/components/ModeToggleSlide'
import { SettingsPanel } from '@renderer/features/settings'
import { Button } from '@renderer/shared/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/shared/components/ui/popover'
import TrafficLights from '@renderer/shared/components/ui/traffic-lights'
import { cn } from '@renderer/shared/lib/utils'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import {
  invokeWindowClose,
  invokeWindowMaximize,
  invokeWindowMinimize
} from '@renderer/infrastructure/ipc'
import { useSheetStore } from '@renderer/features/chat/state/sheetStore'
import { PanelRight } from 'lucide-react'
import React from 'react'

const headerActionButtonClassName = [
  'app-undragable pointer-events-auto h-8 w-8 rounded-lg border border-transparent bg-transparent p-0',
  'text-slate-600 transition-[background-color,border-color,box-shadow,color,transform] duration-200',
  'hover:border-black/[0.08] hover:bg-black/[0.045] hover:text-slate-950 active:scale-95',
  'dark:text-zinc-400 dark:hover:border-white/10 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100'
].join(' ')

const ChatHeader: React.FC = () => {
  const chatTitle = useChatStore(state => state.chatTitle)
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const toggleArtifactsPanel = useChatStore(state => state.toggleArtifactsPanel)
  const { setSheetOpenState } = useSheetStore()
  const artifactsToggleLabel = artifactsPanelOpen
    ? 'Close artifacts panel'
    : 'Open artifacts panel'

  return (
    <header
      className="header relative z-50 h-10 shrink-0 overflow-visible app-dragable"
      style={{ userSelect: 'none' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -bottom-2 bg-white/90 dark:bg-zinc-950/50 backdrop-blur-3xl"
        style={{
          WebkitMaskImage:
            'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)'
        }}
      />

      <div className="pointer-events-none relative z-10 grid h-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4">
        <div className="flex min-w-0 items-center gap-4 justify-self-start">
          <div className="app-undragable pointer-events-auto">
            <TrafficLights
              onClose={invokeWindowClose}
              onMinimize={invokeWindowMinimize}
              onMaximize={invokeWindowMaximize}
            />
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
              <PopoverContent className="app-undragable ml-1 mt-0.5 h-[93vh] w-[95vw] overflow-hidden rounded-2xl p-2 bg-white dark:bg-zinc-950/80">
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
            <ModeToggleSlide triggerClassName={headerActionButtonClassName} />
          </div>
          <Button
            className={cn(
              headerActionButtonClassName,
              artifactsPanelOpen
                && 'border-black/[0.08] bg-black/[0.06] shadow-xs hover:bg-black/[0.08] dark:border-white/10 dark:bg-white/[0.09] dark:hover:bg-white/[0.11]'
            )}
            variant="ghost"
            onClick={toggleArtifactsPanel}
            aria-label={artifactsToggleLabel}
            aria-pressed={artifactsPanelOpen}
            title={artifactsToggleLabel}
          >
            <PanelRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  )
}

export default ChatHeader
