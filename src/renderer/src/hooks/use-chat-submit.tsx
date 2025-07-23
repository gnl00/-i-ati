import { useChatContext } from "@renderer/context/ChatContext"
import { getChatById, updateChat } from "@renderer/db/ChatRepository"
import { saveMessage } from "@renderer/db/MessageRepository"
import { useChatStore } from "@renderer/store"
import { chatRequestWithHook, chatRequestWithHookV2 } from "@request/index"
import { toast } from '@renderer/components/ui/use-toast'
import { v4 as uuidv4 } from 'uuid'
import { saveChat } from "@renderer/db/ChatRepository"
import { WEB_SEARCH_ACTION } from "@constants/index"

const generateTitlePrompt = "Generate a briefly and precisely title from the context below. NOTE: GENERATE TITLE FROM **THE QUESTION** OR **THE ACTION**; DO REMEMBER: **RETURN ME THE TITLE ONLY**\n"
const generateSearchKeywordsPrompt = "Generate some briefly and precisely search keywords from the context below. NOTE: 查询关键词必须与输入内容严格关联,描述准确,并且拆分开的关键词需要有明确的意义. 比如：输入内容=查询北京的天气，查询关键词可以拆分成=[北京天气,北京今天的天气,北京天气预报],**不能**拆分成['今天','北京','的','天气'],没个 keyword 没有完整信息，也破坏了用户意图. DO REMEMBER: **RETURN ME THE KEYWORDS SPLIT BY ','**\n"

function chatSubmit() {
  const {
    chatId, setChatId,
    chatUuid, setChatUuid,
    chatTitle, setChatTitle,
    updateChatList,
    setLastMsgStatus,
  } = useChatContext()
  const { 
    provider,
    getProviderByName,
    providers,
    models, 
    messages, 
    selectedModel, 
    setMessages, 
    setFetchState, 
    setCurrentReqCtrl, 
    setReadStreamState,
    selectedTitleModel,
    webSearchEnable,
    webSearchProcessing, setWebSearchProcessState,
  } = useChatStore()
  
  const onSubmit = async (textCtx: string, mediaCtx: ClipbordImg[] | string[]): Promise<void> => {
    if (!textCtx) {
      return
    }

    setReadStreamState(true)

    let messageBody: ChatMessage

    const model = selectedModel!
    const modelType = model.type
    if (modelType === 'llm') {
      messageBody = { role: "user", content: textCtx.trim() } as ChatMessage
    } else if (modelType === 'vlm') {
      const imgContents: VLMContent[] = []
      mediaCtx.forEach(imgBase64 => {
        imgContents.push({ type: 'image_url', image_url: { url: imgBase64 as string, detail: 'auto' } })
      })
      messageBody = { 
        role: "user", 
        content: [...imgContents, { type: 'text', text: textCtx.trim() } ]
      }
    } else {
      return
    }

    const userMessageEntity: MessageEntity = { body: messageBody }
    const usrMsgId = await saveMessage(userMessageEntity) as number
    // console.log(`modelType=${modelType} msgId=${usrMsgId}`, userMessageEntity)

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

    let keywords: string[] = []
    let searchResults = []
    if(webSearchEnable) {
      setWebSearchProcessState(true)
      try {
        const {keywords: k, result: r} = await processWebSearch(textCtx.trim(), model)
        keywords = k, searchResults = r
        if (searchResults.length === 0) {
          // TODO add search failed flag
          console.log('break request bacause no searchResults')
          return
        }
      } catch(error: any) {
        console.log('processWebSearch error', error.message)
        return
      } finally {
        setWebSearchProcessState(false)
        setReadStreamState(false)
      }
    }

    let searchMessageEntity: ChatMessage = {role: 'user', content: searchResults.length > 0 ? searchResults.join('\n') : ''}
    
    const p: IProvider = providers.findLast(p => p.name === model.provider)!
    const req: IChatRequestV2 = {
      url: p.apiUrl,
      messages: [...messageEntities.map(msg => msg.body), searchMessageEntity],
      token: p.apiKey,
      prompt: '',
      model: model.value,
    }

    const controller = new AbortController()
    setCurrentReqCtrl(controller)
    const signal = controller.signal

    let gatherContent = ''
    let gatherReasoning = ''
    let sysMessageEntity: MessageEntity = { body: { role: 'system', content: '' } }
    let isContentHasThinkTag = false // 标记是否在<think>标签内
    chatRequestWithHookV2(req, signal, beforeFetch, afterFetch).then(async (reader) => {
        if (reader) {
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
              if (json.error) {
                throw Error(json.error)
              }
              if (isContentHasThinkTag) {
                if (!gatherReasoning) {
                  gatherReasoning = gatherContent
                  gatherContent = ''
                }
                gatherReasoning += json.choices[0].delta.content
                if (gatherReasoning.includes('</think>')) {
                  gatherReasoning = gatherReasoning.replace('</think>', '')
                  isContentHasThinkTag = false
                }
              } else {
                if (gatherContent.includes('<think>')) {
                  isContentHasThinkTag = true
                  // gatherContent += json.choices[0].delta.content
                  gatherContent = json.choices[0].delta.content
                } else if (json.choices[0].delta.content) {
                  gatherContent += json.choices[0].delta.content
                } else if (json.choices[0].delta.reasoning) {
                  gatherReasoning += json.choices[0].delta.reasoning || '';
                }
              }
              // console.log(gatherReasoning)
              // console.log(gatherContent)
              setMessages([...messages, userMessageEntity, { body: { role: 'system', content: gatherContent, reasoning: gatherReasoning} }])
            })
            if (eventDone) {
              sysMessageEntity.body.content = gatherContent
              sysMessageEntity.body.reasoning = gatherReasoning
              break
            }
          }
        }
        setLastMsgStatus(true)
      }).then(async () => {
        // console.log('generate chatTitle');
        if (!chatTitle || chatTitle === 'NewChat') {
          // TODO fix generateTitle
          // const title = await generateTitle(textCtx) as string
          const roughlyTitle = webSearchEnable ? keywords[0] : textCtx.substring(0, 12)
          chatEntity.title = roughlyTitle
          setChatTitle(roughlyTitle)
        }

      }).catch(err => {
        if (err.name !== 'AbortError') {
          toast({
            variant: "destructive",
            title: "Uh oh! Request went wrong.",
            description: `There was a problem with your request. ${err.message}`
          })
        }
        setLastMsgStatus(false)
      }).finally(async () => {
        console.log('save messageEntity');
        
        setReadStreamState(false)
        if (gatherContent || gatherReasoning) {
          const sysMsgId = await saveMessage(sysMessageEntity) as number
          chatEntity.messages = [...chatEntity.messages, sysMsgId]
          chatEntity.updateTime = new Date().getTime()
          updateChat(chatEntity)
          updateChatList(chatEntity)
        }
      })
  }
  const beforeFetch = () => {
    setFetchState(true)
  }
  const afterFetch = () => {
    setFetchState(false)
  }
  const processWebSearch = async (chatCtx: string, model: IModel) => {
    const keywords: string[] = await generateKeyWords(chatCtx, model)
    keywords.length === 0 && keywords.push(chatCtx)
    const searchResults = await window.electron?.ipcRenderer.invoke(WEB_SEARCH_ACTION, {
      action: 'navigate',
      param: keywords[0]
    })
    console.log('searchResults', searchResults)
    
    return {success: searchResults.success, keywords, result: searchResults.result}
  }
  const generateKeyWords = async (chatCtx: string, model: IModel) => {
    // console.log("generating search keywords");
    const provider = getProviderByName(model.provider)!
    const req: IChatRequest = {
      url: provider.apiUrl,
      content: chatCtx,
      prompt: generateSearchKeywordsPrompt,
      token: provider.apiKey,
      model: model.value,
      stream: false
    }
    const keywroldResponse = await chatRequestWithHook(req, () => { }, () => { })
    // console.log('keyword response', keywroldResponse)
    const resp = await keywroldResponse.json()
    const keywordsStr: string = resp.choices[0].message.content
    // console.log('keywroldResponse.json', resp)
    const keywords = keywordsStr.split(',')
    return keywords
  }
  const generateTitle = async (context) => {
    console.log("generateTitle...");
    
    const titleModel = models.find(md => selectedTitleModel === md.value)!
    const titleProvider: IProvider = providers.findLast(p => p.name === titleModel.provider)!
    console.log(titleModel, titleProvider);
    
    const titleReq: IChatRequest = {
      url: titleProvider.apiUrl,
      content: context,
      prompt: generateTitlePrompt,
      token: titleProvider.apiKey,
      model: titleModel.value,
      stream: false
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
        try {
          const json = JSON.parse(data.substring(('data:'.length + 1)))
          const resultText = json.choices[0].delta.content
          title += resultText || ''
          console.log(title);
        } catch (error: any) {
          console.log("Generate title ERROR: ", error.message)
        }
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