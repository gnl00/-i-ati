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
const generateSearchKeywordsPrompt = `[/no_think /no_thinking /do_not_think]\nGenerate some briefly and precisely search keywords from the context up and down. 
- 查询关键词必须与最后一个用户输入内容严格关联,描述准确,并且拆分开的关键词需要有明确的意义. 
  比如: 输入内容='查询北京的天气',查询关键词可以拆分成 '北京天气,北京今天的天气,北京天气预报',**不能**拆分成 '今天','北京','的','天气',这会导致 keyword 没有完整信息,也破坏了用户意图.
- 如果用户输入的信息比较模糊,尝试从上下文推断。
  比如:用户第一步问: '明天北京的天气怎么样？',你的回答可能是:'明天北京天气,北京明天天气,北京天气预报'.
      在得到你的回答之后,用户第二步问:'那上海呢?'
      你需要从上下文中提取出关键的,准确的时间信息,你生成的查询关键词应该是 '明天上海天气预报,上海天气,上海天气预报'.
NOTE: NEVER EXPIAN, OUTPUT THE KEYWORDS STRING ONLY!!!. DO REMEMBER: **RETURN ME THE KEYWORDS SPLIT BY ','**\n
`
const artifactsTool = '/artifacts_tool'
const artifactsSystemPrompt = `当用户输入以 ${artifactsTool} 开头时，直接生成一个可运行的 HTML 或 SVG 示例，**不要输出任何解释文字**，只返回一段用 <antArtifact> 包裹的内容，并附带 identifier、type、title 三个属性。

示例 1（HTML）：
<antArtifact identifier="hello-html" type="text/html" title="Hello Page">
<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>Hello</title>
    <style>
      body{margin:0;font-family:sans-serif;background:#f5f5f5;display:flex;height:100vh;align-items:center;justify-content:center}
      h1{color:#1976d2}
    </style>
  </head>
  <body>
    <h1>Hello from HTML artifact!</h1>
  </body>
</html>
</antArtifact>

示例 2（SVG）：
<antArtifact identifier="smiley-svg" type="image/svg+xml" title="Smiley Face">
<svg viewBox="0 0 100 100" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="45" fill="#ffeb3b"/>
  <circle cx="35" cy="40" r="5" fill="#000"/>
  <circle cx="65" cy="40" r="5" fill="#000"/>
  <path d="M30 70 Q50 85 70 70" stroke="#000" stroke-width="3" fill="none"/>
</svg>
</antArtifact>
`

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
    artifacts,
  } = useChatStore()
  
  const onSubmit = async (textCtx: string, mediaCtx: ClipbordImg[] | string[]): Promise<void> => {
    if (!textCtx) {
      return
    }

    if (!selectedModel) {
      toast({
        variant: "destructive",
        title: "Uh oh! Request went wrong.",
        description: 'Please select a model first!'
      })
      return
    }

    // build user message
    let messageBody: ChatMessage
    const model = selectedModel
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

    // network request start from now
    setReadStreamState(true)

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

    // build send messages
    let chatMessages = messageEntities.map(msg => msg.body)
    if (artifacts) {
      chatMessages = chatMessages.map((m, idx) => {
        if ((idx === chatMessages.length - 1) && (typeof m.content) === 'string') {
          // 创建对象的深拷贝，避免修改原始对象
          let nextM = { ...m }
          nextM.content = artifactsTool.concat('\n\n').concat(m.content as string)
          return nextM
        }
        return m
      })
    }

    const p: IProvider = providers.findLast(p => p.name === model.provider)!
    const req: IChatRequestV2 = {
      url: p.apiUrl,
      messages: webSearchEnable ? [...chatMessages, searchFunctionMessage] : chatMessages,
      token: p.apiKey,
      prompt: [artifacts ? artifactsSystemPrompt : ''].join('\n\n'),
      model: model.value,
    }

    const controller = new AbortController()
    setCurrentReqCtrl(controller)
    const signal = controller.signal

    let gatherContent = ''
    let gatherReasoning = ''
    let sysMessageEntity: MessageEntity = { body: { role: 'system', content: '', artifatcs: artifacts } }
    let isContentHasThinkTag = false // 标记是否在<think>标签内
    chatRequestWithHookV2(req, signal, beforeFetch, afterFetch).then(async (reader) => {
        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              sysMessageEntity.body.content = gatherContent
              sysMessageEntity.body.reasoning = gatherReasoning
              break
            }
            const lines = value
              .split("\n")
              .filter((line) => line.trim() !== "")
              .map((line) => line.replace(/^data: /, ""))
            for (const line of lines) {
              // console.log('line', line)
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
                setMessages([...messages, userMessageEntity, { body: { role: 'system', content: gatherContent, reasoning: gatherReasoning, artifatcs: artifacts} }])
              } catch {
                // 忽略解析失败的行
              }
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
        setReadStreamState(false)
        if (gatherContent || gatherReasoning) {
          console.log('save messageEntity');
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
    console.log('web-search keywords', keywords)
    
    const searchResults = await window.electron?.ipcRenderer.invoke(WEB_SEARCH_ACTION, {
      action: 'navigate',
      param: keywords[0]
    })
    // console.log('web-search searchResults', searchResults)
    return {success: searchResults.success, keywords, result: searchResults.result}
  }
  const generateKeyWords = async (chatCtx: string, model: IModel) => {
    // console.log("generating search keywords")
    const provider = getProviderByName(model.provider)!
    console.log('web-search context', messages);
    
    const reqWithContext: IChatRequestV2 = {
      url: provider.apiUrl,
      messages: [...messages.slice(messages.length - 3).map(msg => msg.body), {role: 'user', content: chatCtx}],
      token: provider.apiKey,
      prompt: generateSearchKeywordsPrompt,
      model: model.value,
      stream: false,
    }
    const keywroldResponse = await chatRequestWithHookV2(reqWithContext, null, () => {}, () => {})
    // console.log('keyword response', keywroldResponse)
    const resp = await keywroldResponse.json()
    let keywordsStr: string = resp.choices[0].message.content
    if (keywordsStr.includes('<think>') && keywordsStr.includes('</think>')) {
      keywordsStr = keywordsStr.substring(keywordsStr.indexOf('</think>') + '</think>'.length)
    }
    const keywords = keywordsStr.includes(',') ? keywordsStr.split(',') : []
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