import React, { useEffect, useState } from 'react'
import { GearIcon, DrawingPinIcon, DrawingPinFilledIcon } from '@radix-ui/react-icons'
import PreferenceComponent from './PreferenceComp'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { ModeToggle } from '../mode-toggle'
import { GET_CONFIG, OPEN_EXTERNAL, PIN_WINDOW } from '@constants/index'
import { useChatContext } from '@renderer/context/ChatContext'

interface HeaderProps {
}

const Header: React.FC<HeaderProps> = (props: HeaderProps) => {
  const [pinState, setPinState] = useState<boolean>(false)
  const { chatTitle, appConfig, setAppConfig } = useChatContext()

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

  const onTokenQuestionClick = (url: string): void => {
    console.log('token question click')
    window.electron.ipcRenderer.invoke(OPEN_EXTERNAL, url)
  }

  return (
    <div className="header shadow-lg fixed top-0 w-full pb-2 pr-2 pl-2 pt-2 flex items-center justify-between z-10" style={{ userSelect: 'none' }}>
      <div className="app-dragable flex-1 space-x-2 flex">
        <Popover>
          <PopoverTrigger asChild className="app-undragable">
            <Button variant="outline" size="icon">
              <GearIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="m-2 min-w-96 app-undragable">
            <PreferenceComponent
              onTokenQuestionClick={onTokenQuestionClick}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className='app-dragable flex-1 flex justify-center'>
        <Button className='app-undragable h-auto w-auto' variant='secondary'>{chatTitle}</Button>
      </div>
      <div className="app-dragable flex-1 flex justify-end space-x-1">
        <div className="app-undragable"><ModeToggle /></div>
        <Button className="app-undragable" size="icon" variant="outline" onClick={onPinToggleClick}>
          {pinState ? <DrawingPinFilledIcon /> : <DrawingPinIcon />}
        </Button>
      </div>
    </div>
  )
}

export default Header