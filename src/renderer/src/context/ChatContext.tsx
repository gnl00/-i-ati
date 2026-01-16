import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { VListHandle } from 'virtua'
import { invokeSetFileOperationsBaseDir } from '@tools/fileOperations/renderer/FileOperationsInvoker'

type ChatContextType = {
  editableContentId: number | undefined
  setEditableContentId: (id: number) => void
  chatListRef: React.RefObject<VListHandle>
  chatContent: string
  setChatContent: (content: string) => void
  chatId: number | undefined
  setChatId: (chatId: number | undefined) => void
  chatUuid: string | undefined
  setChatUuid: (uuid: string | undefined) => void
  chatTitle: string | undefined
  setChatTitle: (title: string) => void
  chatList: ChatEntity[]
  setChatList: (list: ChatEntity[]) => void
  updateChatList: (chatEntity: ChatEntity) => void
  lastMsgStatus: boolean
  setLastMsgStatus: (state: boolean) => void
}
const ChatContext = createContext<ChatContextType | undefined>(undefined)

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
      throw new Error('useChatContext must be used within a ChatProvider')
  }
  return context
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chatId, setChatId] = useState<number>()
  const [chatUuid, setChatUuid] = useState<string>()
  const [chatTitle, setChatTitle] = useState('NewChat')
  const [chatList, setChatList] = useState<ChatEntity[]>([])
  const [chatContent, setChatContent] = useState<string>('')
  const [editableContentId, setEditableContentId] = useState<number | undefined>()
  const [lastMsgStatus, setLastMsgStatus] = useState<boolean>(false)

  const chatListRef = useRef<VListHandle>(null)
  const updateChatList = (chatEntity: ChatEntity) => {
    setChatList(prev => {
        const nextChatList: ChatEntity[] = []
        prev.forEach(c => {
            if (chatEntity.uuid === c.uuid) {
                nextChatList.push(chatEntity)
            } else {
                nextChatList.push(c)
            }
        })
        return nextChatList
    })
  }

  // Update file operations base directory when chat changes
  useEffect(() => {
    if (chatUuid && chatList.length > 0) {
      // 从 chatList 中获取当前 chat 的 workspacePath
      const currentChat = chatList.find(chat => chat.uuid === chatUuid)

      // 只有在 chatList 中找到当前 chat 时才更新
      if (currentChat) {
        const customWorkspacePath = currentChat?.workspacePath
        invokeSetFileOperationsBaseDir(chatUuid, customWorkspacePath)
      }
    }
  }, [chatUuid, chatList])

  return (
      <ChatContext.Provider 
        value={{
          chatContent, setChatContent,
          editableContentId, setEditableContentId,
          chatId, setChatId,
          chatUuid, setChatUuid,
          chatTitle, setChatTitle,
          chatList, setChatList,
          lastMsgStatus, setLastMsgStatus,
          updateChatList,
          chatListRef
        }}
      >
          {children}
      </ChatContext.Provider>
  )
}