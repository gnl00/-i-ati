import React, { createContext, useContext, useRef, useState } from 'react'
import { VListHandle } from 'virtua'
import { updateChat } from '@renderer/db/ChatRepository'
import { getChatFromList } from '@renderer/utils/chatWorkspace'

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
  updateWorkspacePath: (workspacePath?: string) => Promise<void>
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

  const updateWorkspacePath = async (workspacePath?: string) => {
    if (!chatId || !chatUuid) return
    const currentChat = getChatFromList({ chatUuid, chatId, chatList })
    if (!currentChat) return

    const updatedChat: ChatEntity = {
      ...currentChat,
      workspacePath,
      updateTime: Date.now()
    }

    await updateChat(updatedChat)
    updateChatList(updatedChat)
  }

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
          updateWorkspacePath,
          chatListRef
        }}
      >
          {children}
      </ChatContext.Provider>
  )
}
