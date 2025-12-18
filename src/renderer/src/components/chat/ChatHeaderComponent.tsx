import React, { useEffect, useState } from 'react'
import { GearIcon, DrawingPinIcon, DrawingPinFilledIcon, ActivityLogIcon, MinusIcon } from '@radix-ui/react-icons'
import PreferenceComponent from '@renderer/components/sys/PreferenceComponent'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { ModeToggle } from '@renderer/components/mode-toggle'
import TrafficLights from '@renderer/components/ui/traffic-lights'
import { GET_CONFIG, OPEN_EXTERNAL, PIN_WINDOW } from '@constants/index'
import { useChatContext } from '@renderer/context/ChatContext'
import { useChatStore } from '@renderer/store'
import { useSheetStore } from '@renderer/store/sheet'

interface ChatHeaderProps {}

const ChatHeaderComponent: React.FC<ChatHeaderProps> = (props: ChatHeaderProps) => {
  const [pinState, setPinState] = useState<boolean>(false)
  const { chatTitle } = useChatContext()
  const { appConfig, setAppConfig } = useChatStore()
  const {setSheetOpenState} = useSheetStore()

  useEffect(() => {
    window.electron.ipcRenderer.invoke(GET_CONFIG).then((config: IAppConfig) => {
      setAppConfig({
          ...appConfig,
          ...config
      })
    })
  }, [])

  const onPinToggleClick = (): void => {
    setPinState(!pinState)
    window.electron.ipcRenderer.invoke(PIN_WINDOW, !pinState) // pin window
  }

  const onMinimizeBtnClick = () => {
    console.log('onMinimalBtnClick')
    window.electron.ipcRenderer.invoke('win-minimize')
  }
  return (
    <div className="header shadow-sm fixed top-0 w-full pb-1 pr-2 pl-3 pt-1 flex items-center justify-between app-dragable bg-gray-50 dark:bg-black/100 z-10" style={{ userSelect: 'none' }}>
      {/* macOS Traffic Lights */}
      <div className="flex items-center space-x-3">
        <TrafficLights />
        <div className="app-dragable flex space-x-2">
          <Button className="app-undragable rounded-xl bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700" variant="ghost" size="sm" onClick={_ => {setSheetOpenState(true)}}>
            <ActivityLogIcon className="dark:text-gray-300" />
          </Button>
          <Popover>
            <PopoverTrigger asChild className="app-undragable">
              <Button className="rounded-xl bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700" variant="ghost" size="sm">
                <GearIcon className="dark:text-gray-300" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="m-1 app-undragable w-auto h-full">
              <PreferenceComponent />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Center Title */}
      <div className='app-dragable flex-1 flex justify-center'>
        <span className='text-gray-500 dark:text-gray-300 font-semibold text-sm bg-gray-100 dark:bg-gray-800 p-1 px-2 rounded-xl'>{chatTitle}</span>
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