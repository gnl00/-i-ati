import React, { useEffect, useState } from 'react'
import { GearIcon, DrawingPinIcon, DrawingPinFilledIcon, ActivityLogIcon } from '@radix-ui/react-icons'
import PreferenceComponent from '@renderer/components/sys/PreferenceComponent'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { ModeToggle } from '@renderer/components/mode-toggle'
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

  return (
    <div className="header shadow-lg fixed top-0 w-full pb-1 pr-2 pl-2 pt-1 flex items-center justify-between app-dragable bg-gray-50 dark:bg-black/100" style={{ userSelect: 'none' }}>
      <div className="app-dragable flex-1 space-x-2 flex">
        <Button className="app-undragable" variant="outline" size="sm" onClick={_ => {setSheetOpenState(true)}}>
          <ActivityLogIcon />
        </Button>
        <Popover>
          <PopoverTrigger asChild className="app-undragable">
            <Button variant="outline" size="sm">
              <GearIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="m-2 app-undragable w-auto h-full">
            <PreferenceComponent />
          </PopoverContent>
        </Popover>
      </div>
      <div className='app-dragable flex-1 flex justify-center'>
        <Button className='app-undragable' size="sm" variant='secondary'>{chatTitle}</Button>
      </div>
      <div className="app-dragable flex-1 flex justify-end space-x-1">
        <div className="app-undragable"><ModeToggle /></div>
        <Button className="app-undragable" size="sm" variant="outline" onClick={onPinToggleClick}>
          {pinState ? <DrawingPinFilledIcon /> : <DrawingPinIcon />}
        </Button>
      </div>
    </div>
  )
}

export default ChatHeaderComponent