import { useChatContext } from "@renderer/context/ChatContext"
import { getChatById, updateChat } from "@renderer/db/ChatRepository"
import { saveMessage } from "@renderer/db/MessageRepository"
import { useChatStore } from "@renderer/store"
import { chatRequestWithHook, chatRequestWithHookV2 } from "@request/index"
import { toast } from '@renderer/components/ui/use-toast'
import { v4 as uuidv4 } from 'uuid'
import { saveChat } from "@renderer/db/ChatRepository"
import { WEB_SEARCH_ACTION } from "@constants/index"

const generateTitlePrompt = "[/no_think /no_thinking /do_not_think]\nGenerate a briefly and precisely title from the context below. NOTE: GENERATE TITLE FROM **THE QUESTION** OR **THE ACTION**; DO REMEMBER: **RETURN ME THE TITLE ONLY**\n"
const generateSearchKeywordsPrompt = "[/no_think /no_thinking /do_not_think]\nGenerate some briefly and precisely search keywords from the context below. NOTE: 查询关键词必须与输入内容严格关联,描述准确,并且拆分开的关键词需要有明确的意义. 比如：输入内容=查询北京的天气，查询关键词可以拆分成=[北京天气,北京今天的天气,北京天气预报],**不能**拆分成['今天','北京','的','天气'],没个 keyword 没有完整信息，也破坏了用户意图. DO REMEMBER: **RETURN ME THE KEYWORDS SPLIT BY ','**\n"

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

    // build user message
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

    const messageEntities = [...messages, userMessageEntity]
    setMessages(messageEntities)

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

    // processing search action
    let keywords: string[] = []
    let searchResults = []
    if(webSearchEnable) {
      setWebSearchProcessState(true)
      try {
        const {keywords: k, result: r} = await processWebSearch(textCtx.trim(), model)
        keywords = k, searchResults = r
        
        if (searchResults.length === 0) {
          throw Error('There is no search result.')
        }
      } catch(error: any) {
        toast({
          variant: "destructive",
          title: "Uh oh! WebSearch went wrong.",
          description: error.message
        })
        return
      } finally {
        setWebSearchProcessState(false)
        setReadStreamState(false)
      }
    }

    // build search fucntion message
    let searchFunctionMessage: ChatMessage = {role: 'function', name: 'web_search', content: searchResults.length > 0 ? searchResults.join('\n') : ''}

    const p: IProvider = providers.findLast(p => p.name === model.provider)!
    const req: IChatRequestV2 = {
      url: p.apiUrl,
      messages: [...messageEntities.map(msg => msg.body), searchFunctionMessage],
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
            const lines = value
              .split("\n")
              .filter((line) => line.trim() !== "")
              .map((line) => line.replace(/^data: /, ""))
            for (const line of lines) {
              if (line === "[DONE]") {
                eventDone = true
                return
              }
              try {
                const delta = JSON.parse(line).choices?.[0]?.delta
                if (delta) {
                  if (isContentHasThinkTag) {
                    if (!gatherReasoning) {
                      gatherReasoning = gatherContent
                      gatherContent = ''
                    }
                    if (delta.content) {
                      gatherReasoning += delta.content
                    }
                    if (gatherReasoning.includes('</think>')) {
                      gatherReasoning = gatherReasoning.replace('</think>', '')
                      isContentHasThinkTag = false
                    }
                  } else {
                    if (gatherContent.includes('<think>')) {
                      isContentHasThinkTag = true
                      if (delta.content) {
                        gatherContent = delta.content
                      }
                    } else if (delta.content) {
                      gatherContent += delta.content
                    } else if (delta.reasoning) {
                      gatherReasoning += delta.reasoning || ''
                    }
                  }
                }
                setMessages([...messages, userMessageEntity, { body: { role: 'system', content: gatherContent, reasoning: gatherReasoning} }])
              } catch {
                // 忽略解析失败的行
              }
            }
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
        console.log('use-chat-submmit error', err)
        if (err.name !== 'AbortError') {
          toast({
            variant: "destructive",
            title: "Uh oh! Request went wrong.",
            description: `There was a problem with your request. ${err.message}`
          })
        }
        setLastMsgStatus(false)
      }).finally(async () => {
        // console.log('save messageEntity');
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
    console.log('processWebSearch keywords', keywords)
    
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
    const keywroldResponse = await chatRequestWithHook(req, () => {}, () => {})
    // console.log('keyword response', keywroldResponse)
    const resp = await keywroldResponse.json()
    let keywordsStr: string = resp.choices[0].message.content
    if (keywordsStr.includes('<think>') && keywordsStr.includes('</think>')) {
      keywordsStr = keywordsStr.substring(keywordsStr.indexOf('</think>') + '</think>'.length)
    }
    const keywords = keywordsStr.includes(',') ? keywordsStr.split(',') : []
    console.log('keywords response', keywords)
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

    const response = await chatRequestWithHook(titleReq, () => {}, () => {})
    const json = await response.json()
    // console.log('generateTitle response', json)
    let title: string = json.choices[0].message.content
    setChatTitle(title)
    return title
  }

  return onSubmit
}

export default chatSubmit