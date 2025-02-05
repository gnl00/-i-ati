import React from 'react'
import { useSheetStore } from '@renderer/store/sheet'

interface ChatSheetHoverProps {}

const ChatSheetHoverComponent: React.FC<ChatSheetHoverProps> = (props: ChatSheetHoverProps) => {
  const {setSheetOpenState} = useSheetStore()
  return (
      <div
          className="h-[35vh] fixed left-0 top-1/4 cursor-pointer w-[0.5vh] rounded-full hover:shadow-blue-600/100 hover:shadow-lg"
          onMouseEnter={_ => {setSheetOpenState(true)}}
          style={{ userSelect: 'none' }}
      />
  )
}

export default ChatSheetHoverComponent