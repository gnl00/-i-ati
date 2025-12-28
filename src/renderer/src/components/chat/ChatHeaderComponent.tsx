import { ActivityLogIcon, DrawingPinFilledIcon, DrawingPinIcon, GearIcon } from '@radix-ui/react-icons'
import { ModeToggle } from '@renderer/components/mode-toggle'
import PreferenceComponent from '@renderer/components/sys/PreferenceComponent'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import TrafficLights from '@renderer/components/ui/traffic-lights'
import { useChatContext } from '@renderer/context/ChatContext'
import { invokePinWindow } from '@renderer/invoker/ipcInvoker'
import { useSheetStore } from '@renderer/store/sheet'
import { getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { FolderOpen } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

interface ChatHeaderProps { }

const ChatHeaderComponent: React.FC<ChatHeaderProps> = (_props: ChatHeaderProps) => {
  const [pinState, setPinState] = useState<boolean>(false)
  const { chatTitle, chatUuid } = useChatContext()
  const { setSheetOpenState } = useSheetStore()

  const onPinToggleClick = (): void => {
    setPinState(!pinState)
    invokePinWindow(!pinState) // pin window
  }

  const onCopyWorkspacePath = (): void => {
    const workspacePath = getWorkspacePath(chatUuid)
    navigator.clipboard.writeText(workspacePath)
    toast.success(`Copied: ${workspacePath}`)
  }

  return (
    <div className="header shadow-sm fixed top-0 w-full pb-1 pr-2 pl-3 pt-1 flex items-center justify-between app-dragable bg-gray-50 dark:bg-black/100 z-10" style={{ userSelect: 'none' }}>
      {/* macOS Traffic Lights */}
      <div className="flex items-center space-x-3">
        <TrafficLights />
        <div className="app-dragable flex space-x-2">
          <Button className="app-undragable rounded-xl bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700" variant="ghost" size="sm" onClick={__ => { setSheetOpenState(true) }}>
            <ActivityLogIcon className="dark:text-gray-300" />
          </Button>
          <Popover>
            <PopoverTrigger asChild className="app-undragable">
              <Button className="rounded-xl bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700" variant="ghost" size="sm">
                <GearIcon className="dark:text-gray-300" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="ml-1 mt-1 p-0 pt-2 px-2 app-undragable w-auto h-full">
              <PreferenceComponent />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Center Title */}
      <div className='app-dragable flex-1 flex justify-center items-end gap-1'>
        <span className='text-gray-500 dark:text-gray-300 font-semibold text-sm bg-gray-100 dark:bg-gray-800 p-1 px-2 rounded-xl truncate max-w-md'>{chatTitle}</span>
        <button
          className="app-undragable rounded hover:bg-gray-200 dark:hover:bg-gray-700 p-0.5 transition-colors group mb-0.5"
          onClick={onCopyWorkspacePath}
          title="Copy workspace path"
        >
          <FolderOpen className="h-2.5 w-2.5 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
        </button>
      </div>

      {/* Right Controls */}
      <div className="app-dragable flex justify-end space-x-1">
        <div className="app-undragable"><ModeToggle /></div>
        <Button className="app-undragable rounded-xl bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700" size="sm" variant="ghost" onClick={onPinToggleClick}>
          {pinState ? <DrawingPinFilledIcon className="dark:text-gray-300" /> : <DrawingPinIcon className="dark:text-gray-300" />}
        </Button>
      </div>
    </div>
  )
}

export default ChatHeaderComponent