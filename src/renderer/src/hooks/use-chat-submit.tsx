import { useChatContext } from "@renderer/context/ChatContext";
import { getChatById, updateChat } from "@renderer/db/ChatRepository";
import { saveMessage } from "@renderer/db/MessageRepository";
import { useChatStore } from "@renderer/store";
import { chatRequestWithHook, chatRequestWithHookV2 } from "@request/index";
import { toast } from '@renderer/components/ui/use-toast'
import { v4 as uuidv4 } from 'uuid'
import { saveChat } from "@renderer/db/ChatRepository";

const generateTitlePrompt = "Generate a briefly and precisely title from the context below. NOTE: GENERATE TITLE FROM **THE QUESTION** OR **THE ACTION**; DO REMEMBER: **RETURN ME THE TITLE ONLY**\n"

function chatSubmit() {
  const {
    chatId, setChatId,
    chatUuid, setChatUuid,
    chatTitle, setChatTitle,
    updateChatList,
    setLastMsgStatus,
  } = useChatContext()
  const { models, messages, selectedModel, provider, providers, setMessages, setFetchState, setCurrentReqCtrl, setReadStreamState } = useChatStore()

  const onSubmit = async (textCtx: string, mediaCtx: ClipbordImg[] | string[]): Promise<void> => {
    if (!textCtx) {
      return
    }

    let messageBody: ChatMessage
    const model = models.findLast(model => selectedModel === model.value)!
    const modelType = model.type
    if (modelType === 'llm') {
      messageBody = { role: "user", content: textCtx.trim() } as ChatMessage
    } else if (modelType === 'vlm') {
      const imgContents: VLMContent[] = []
      mediaCtx.forEach(imgBase64 => {
        imgContents.push({ type: 'image_url', image_url: { url: imgBase64 as string, detail: 'auto' } })
      })
      messageBody = { role: "user", content: [...imgContents, { type: 'text', text: textCtx.trim() }] }
    } else {
      return
    }

    const userMessageEntity: MessageEntity = { body: messageBody }
    const usrMsgId = await saveMessage(userMessageEntity) as number
    console.log(`modelType=${modelType} msgId=${usrMsgId}`, userMessageEntity)

    let currChatId = chatId
    let chatEntity: ChatEntity
    if (!chatUuid && !chatId) {
      const currChatUuid = uuidv4()
      setChatUuid(currChatUuid)
      chatEntity = { uuid: currChatUuid, title: 'NewChat', messages: [usrMsgId], createTime: new Date().getTime(), updateTime: new Date().getTime() }
      const saveChatRetVal = await saveChat(chatEntity)
      currChatId = saveChatRetVal as number
      setChatId(currChatId)
      chatEntity.id = currChatId
    } else {
      chatEntity = await getChatById(currChatId)
      chatEntity.messages = [...chatEntity.messages, usrMsgId]
      chatEntity.updateTime = new Date().getTime()
      updateChat(chatEntity)
    }
    updateChatList(chatEntity)

    const messageEntities = [...messages, userMessageEntity]
    setMessages(messageEntities)

    const currProvider = model.provider as IProvider
    const req: IChatRequestV2 = {
      url: currProvider.apiUrl,
      messages: messageEntities.map(msg => msg.body),
      token: currProvider.apiKey,
      prompt: '',
      model: model.value,
    }

    const controller = new AbortController()
    setCurrentReqCtrl(controller)
    const signal = controller.signal

    let gatherResult = ''
    chatRequestWithHookV2(req, signal, beforeFetch, afterFetch).then(async (reader) => {
        if (reader) {
          setReadStreamState(true)
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            let eventDone = false
            const arr = value.split('\n')
            arr.forEach((data: any) => {
              if (data.length === 0) return // ignore empty message
              if (data.startsWith(':')) return // ignore sse comment message
              if (data === 'data: [DONE]') {
                eventDone = true
                return
              }
              const json = JSON.parse(data.substring(('data:'.length + 1))) // stream response with a "data:" prefix
              const resultText = json.choices[0].delta.content
              gatherResult += resultText || ''
            })
            setMessages([...messages, userMessageEntity, { body: { role: 'system', content: gatherResult } }])
            if (eventDone) {
              break
            }
          }
        }
        setLastMsgStatus(true)
      }).catch(err => {
        if (err.name !== 'AbortError') {
          toast({
            variant: "destructive",
            title: "Uh oh! Something went wrong.",
            description: `There was a problem with your request. ${err.message}`
          })
        }
        setLastMsgStatus(false)
      }).finally(async () => {
        setReadStreamState(false)
        const sysMessageEntity: MessageEntity = { body: { role: 'system', content: gatherResult } }
        const sysMsgId = await saveMessage(sysMessageEntity) as number
        chatEntity.messages = [...chatEntity.messages, sysMsgId]
        if (!chatTitle || chatTitle === 'NewChat') {
          const title = await generateTitle(textCtx) as string
          chatEntity.title = title
        }
        chatEntity.updateTime = new Date().getTime()
        updateChat(chatEntity)
        updateChatList(chatEntity)
      })
  }
  const beforeFetch = () => {
    setFetchState(true)
  }
  const afterFetch = () => {
    setFetchState(false)
  }
  const generateTitle = async (context) => {
    const usedModel = models.find(md => 'Qwen/Qwen2.5-14B-Instruct' === md.value)!
    const currProvider = usedModel.provider as IProvider
    const titleReq: IChatRequest = {
      url: currProvider.apiUrl,
      content: context,
      prompt: generateTitlePrompt,
      token: currProvider.apiKey,
      model: usedModel.value
    }

    const reader = await chatRequestWithHook(titleReq, () => { }, () => { })
    if (!reader) {
      return
    }
    let title = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      let eventDone = false
      const arr = value.split('\n')
      arr.forEach((data: any) => {
        if (data.length === 0) return
        if (data.startsWith(':')) return
        if (data === 'data: [DONE]') {
          eventDone = true
          return
        }
        const json = JSON.parse(data.substring(('data:'.length + 1)))
        const resultText = json.choices[0].delta.content
        title += resultText || ''
      })
      setChatTitle(title)
      if (eventDone) {
        break
      }
    }
    return title
  }

  return onSubmit
}

export default chatSubmit