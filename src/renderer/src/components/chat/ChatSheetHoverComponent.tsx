import React from 'react'
import { useSheetStore } from '@renderer/store/sheet'

interface ChatSheetHoverProps { }

const ChatSheetHoverComponent: React.FC<ChatSheetHoverProps> = (_: ChatSheetHoverProps) => {
  const { setSheetOpenState } = useSheetStore()
  return (
    <div
      className="h-[28vh] fixed left-0 top-16 cursor-pointer w-[2vh] rounded-full hover:shadow-blue-600 hover:shadow-3xl z-50"
      onMouseEnter={_ => { setSheetOpenState(true) }}
      style={{ userSelect: 'none' }}
    />
  )
}

export default ChatSheetHoverComponent