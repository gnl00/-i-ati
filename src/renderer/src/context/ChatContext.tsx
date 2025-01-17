import React, { createContext, useContext, useMemo, useRef, useState } from 'react'
import { VListHandle } from 'virtua'

const localProviders: IProvider[] = [
  {
      name: "OpenAI",
      models: [],
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: ''
  },
  {
      name: "Anthropic",
      models: [],
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: ''
  },
  {
      name: "DeepSeek",
      models: [],
      apiUrl: "https://api.deepseek.com",
      apiKey: ''
  },
  {
      name: "SilliconFlow",
      models: [
          {
              provider: "Qwen",
              name: "Qwen2.5-7B-Instruct",
              value: "Qwen/Qwen2.5-7B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-14B-Instruct",
              value: "Qwen/Qwen2.5-14B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-32B-Instruct",
              value: "Qwen/Qwen2.5-32B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-72B-Instruct",
              value: "Qwen/Qwen2.5-72B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-Coder-7B-Instruct",
              value: "Qwen/Qwen2.5-Coder-7B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-Coder-32B-Instruct",
              value: "Qwen/Qwen2.5-Coder-32B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2-VL-72B-Instruct",
              value: "Qwen/Qwen2-VL-72B-Instruct",
              type: 'vlm'
          },
          {
              provider: "deepseek-ai",
              name: "DeepSeek-V2.5",
              value: "deepseek-ai/DeepSeek-V2.5",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "deepseek-ai",
              name: "deepseek-vl2",
              value: "deepseek-ai/deepseek-vl2",
              type: 'vlm'
          },
      ],
      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
      apiKey: 'sk-qfhmqnmegjzjycpueslxveqpnqpvsyseoqjjieoiutxpzkpx'
  },
  {
      name: "MoonShot",
      models: [],
      apiUrl: "https://api.moonshot.cn/v1",
      apiKey: ''
  }
]

type ChatContextType = {
  editableContentId: number | undefined
  setEditableContentId: (id: number) => void
  imageSrcBase64List: ClipbordImg[]
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void
  chatListRef: React.RefObject<VListHandle>

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
  appConfig: IAppConfig
  setAppConfig: (config: IAppConfig) => void
  appVersion: string
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
  // @ts-ignore
  const appVersion = useMemo(() => __APP_VERSION__, [__APP_VERSION__])
  const [appConfig, setAppConfig] = useState<IAppConfig>({
    providers: localProviders
  })
  const [chatId, setChatId] = useState<number>()
  const [chatUuid, setChatUuid] = useState<string>()
  const [chatTitle, setChatTitle] = useState('NewChat')
  const [chatList, setChatList] = useState<ChatEntity[]>([])
  const [editableContentId, setEditableContentId] = useState<number | undefined>()
  const [imageSrcBase64List, setImageSrcBase64List] = useState<ClipbordImg[]>([])
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

  return (
      <ChatContext.Provider 
        value={{ 
          imageSrcBase64List, setImageSrcBase64List,
          editableContentId, setEditableContentId,
          chatId, setChatId,
          chatUuid, setChatUuid,
          chatTitle, setChatTitle,
          chatList, setChatList,
          lastMsgStatus, setLastMsgStatus,
          appConfig, setAppConfig,
          appVersion,
          updateChatList,
          chatListRef
        }}
      >
          {children}
      </ChatContext.Provider>
  )
}