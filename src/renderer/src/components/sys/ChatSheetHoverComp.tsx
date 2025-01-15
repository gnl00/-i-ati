import { useChatContext } from '@renderer/context/ChatContext';
import React from 'react';

interface ChatSheetHoverCompProps {}

const ChatSheetHoverComp: React.FC<ChatSheetHoverCompProps> = (props: ChatSheetHoverCompProps) => {
  const {setSheetOpenState} = useChatContext()
  return (
      <div
          className="h-[35vh] fixed left-0 top-1/4 cursor-pointer w-[0.5vh] rounded-full hover:shadow-blue-600/100 hover:shadow-lg"
          onMouseEnter={_ => {setSheetOpenState(true)}}
          style={{ userSelect: 'none' }}
      />
  );
};

export default ChatSheetHoverComp;