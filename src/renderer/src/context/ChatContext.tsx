import React, { createContext, useContext, useRef, useState } from 'react';
import { VListHandle } from 'virtua';

type ChatContextType = {
  lastMsgStatus: boolean;
  editableContentId: number | undefined;
  setEditableContentId: (id: number) => void;
  imageSrcBase64List: ClipbordImg[];
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void;
  chatListRef: React.RefObject<VListHandle>;
  reGenerate: () => void;
  toast: Function;
};
const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
      throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chatListRef = useRef<VListHandle>(null)
  const [editableContentId, setEditableContentId] = useState<number | undefined>()
  const [imageSrcBase64List, setImageSrcBase64List] = useState<ClipbordImg[]>([])
  const lastMsgStatus = false;
  const reGenerate = () => {};
  const toast = () => {};

  return (
      <ChatContext.Provider 
        value={{ 
          chatListRef, 
          imageSrcBase64List, 
          setImageSrcBase64List, 
          lastMsgStatus, 
          reGenerate, 
          editableContentId, 
          setEditableContentId, 
          toast
        }}
      >
          {children}
      </ChatContext.Provider>
  );
};