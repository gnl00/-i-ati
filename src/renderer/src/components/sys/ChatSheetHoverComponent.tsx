import React from 'react'
import { useChatStore } from '@renderer/store'

interface ChatSheetHoverProps {}

const ChatSheetHoverComponent: React.FC<ChatSheetHoverProps> = (props: ChatSheetHoverProps) => {
  const {setSheetOpenState} = useChatStore()
  return (
      <div
          className="h-[35vh] fixed left-0 top-1/4 cursor-pointer w-[0.5vh] rounded-full hover:shadow-blue-600/100 hover:shadow-lg"
          onMouseEnter={_ => {setSheetOpenState(true)}}
          style={{ userSelect: 'none' }}
      />
  )
}

export default ChatSheetHoverComponent