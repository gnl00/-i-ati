import React from 'react'
import { useSheetStore } from '@renderer/store/sheet'

interface ChatSheetHoverProps {}

const ChatSheetHoverComponent: React.FC<ChatSheetHoverProps> = (props: ChatSheetHoverProps) => {
  const {setSheetOpenState} = useSheetStore()
  return (
      <div
          className="h-[25vh] fixed left-0 bottom-40 cursor-pointer w-[1vh] rounded-full hover:shadow-blue-600/100 hover:shadow-3xl"
          onMouseEnter={_ => {setSheetOpenState(true)}}
          style={{ userSelect: 'none' }}
      />
  )
}

export default ChatSheetHoverComponent