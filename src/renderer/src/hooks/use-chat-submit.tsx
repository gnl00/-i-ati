import { useChatContext } from "@renderer/context/ChatContext"
import { getChatById, updateChat } from "@renderer/db/ChatRepository"
import { saveMessage } from "@renderer/db/MessageRepository"
import { useChatStore } from "@renderer/store"
import { chatRequestWithHook, chatRequestWithHookV2 } from "@request/index"
import { toast } from '@renderer/components/ui/use-toast'
import { v4 as uuidv4 } from 'uuid'
import { saveChat } from "@renderer/db/ChatRepository"
import { WEB_SEARCH_ACTION } from "@constants/index"
import { toolCallPrompt, artifactsTool, artifactsSystemPrompt, webSearchSystemPrompt, generateTitlePrompt, generateSearchKeywordsPrompt } from '../constant/prompts'

interface ToolCallProps {
  function: string
  args?: string
}

interface ToolCallResult {
  name: string
  content: string
  completed: boolean
  error?: Error
}

// 管道上下文接口
interface ChatPipelineContext {
  // 输入数据
  textCtx: string
  mediaCtx: ClipbordImg[] | string[]
  tools?: any[]
  
  // 消息相关
  userMessageEntity: MessageEntity
  messageEntities: MessageEntity[]
  chatMessages: ChatMessage[]
  
  // 聊天相关
  chatEntity: ChatEntity
  currChatId: number | undefined
  
  // 搜索相关
  keywords: string[]
  searchResults: any[]
  searchFunctionMessage?: ChatMessage
  
  // 请求相关
  request: IChatRequestV2
  provider: IProvider
  model: IModel
  controller: AbortController
  signal: AbortSignal
  
  // 流式处理相关
  gatherContent: string
  gatherReasoning: string
  sysMessageEntity: MessageEntity
  isContentHasThinkTag: boolean
  
  // 工具调用相关
  hasToolCall: boolean
  toolCalls: ToolCallProps[]
  toolCallFunctionName: string
  toolCallFunctionArgs: string
  toolCallResults?: any[]
  
  // 状态
  completed: boolean
  error?: Error
}

function chatSubmit() {
  const {
    chatId, setChatId,
    chatUuid, setChatUuid,
    chatTitle, setChatTitle,
    updateChatList,
    setLastMsgStatus,
  } = useChatContext()
  const { 
    getProviderByName,
    providers,
    messages, 
    selectedModel, 
    setMessages, 
    setFetchState, 
    setCurrentReqCtrl, 
    setReadStreamState,
    titleGenerateModel, titleGenerateEnabled,
    webSearchEnable,
    setWebSearchProcessState,
    artifacts,
  } = useChatStore()

  // 管道函数：准备消息和聊天
  const prepareMessageAndChat = async (textCtx: string, mediaCtx: ClipbordImg[] | string[], tools?: any[]): Promise<ChatPipelineContext> => {
    if (!textCtx) {
      throw new Error('Text content is required')
    }

    if (!selectedModel) {
      toast({
        variant: "destructive",
        title: "Uh oh! Request went wrong.",
        description: 'Please select a model first!'
      })
      throw new Error('No model selected')
    }

    // 构建用户消息
    const model = selectedModel
    let messageBody: ChatMessage = { role: "user", content: '' }
    if (model.type === 'llm') {
      messageBody = {...messageBody, content: textCtx.trim()}
    } else if (model.type === 'vlm') {
      const imgContents: VLMContent[] = []
      mediaCtx.forEach(imgBase64 => {
        imgContents.push({ type: 'image_url', image_url: { url: imgBase64 as string, detail: 'auto' } })
      })
      messageBody = { 
        ...messageBody,
        content: [...imgContents, { type: 'text', text: textCtx.trim() } ]
      }
    } else {
      throw new Error('Unsupported model type')
    }

    const userMessageEntity: MessageEntity = { body: messageBody }
    const usrMsgId = await saveMessage(userMessageEntity) as number
    const messageEntities = [...messages, userMessageEntity]
    setMessages(messageEntities)

    // 处理聊天创建/更新
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

    const controller = new AbortController()
    setCurrentReqCtrl(controller)
    setReadStreamState(true)

    return {
      textCtx,
      mediaCtx,
      tools,
      userMessageEntity,
      messageEntities,
      chatMessages: messageEntities.map(msg => msg.body),
      chatEntity,
      currChatId,
      keywords: [],
      searchResults: [],
      request: {} as IChatRequestV2, // 将在后续管道中填充
      provider: providers.findLast(p => p.name === model.provider)!,
      model,
      controller,
      signal: controller.signal,
      gatherContent: '',
      gatherReasoning: '',
      sysMessageEntity: { body: { role: 'system', content: '', artifatcs: artifacts } },
      isContentHasThinkTag: false,
      hasToolCall: false,
      toolCalls: [],
      toolCallResults: [],
      toolCallFunctionName: '',
      toolCallFunctionArgs: '',
      completed: false
    }
  }

  // 管道函数：处理网络搜索
  const handleWebSearch = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
    if (webSearchEnable) {
      setWebSearchProcessState(true)
      try {
        const {keywords: k, result: r} = await processWebSearch(context.textCtx.trim(), context.model)
        context.keywords = k
        context.searchResults = r
        
        if (context.searchResults.length === 0) {
          throw Error('There is no search result.')
        }
      } catch(error: any) {
        context.error = error
        toast({
          variant: "destructive",
          title: "Uh oh! WebSearch went wrong.",
          description: error.message
        })
        throw error
      } finally {
        setWebSearchProcessState(false)
        setReadStreamState(false)
      }
    }

    // 构建搜索函数消息
    context.searchFunctionMessage = {
      role: 'function', 
      name: 'web_search', 
      content: context.searchResults.length > 0 ? context.searchResults.join('\n') : ''
    }

    return context
  }

  // 管道函数：构建请求
  const buildRequest = (context: ChatPipelineContext): ChatPipelineContext => {
    // 构建发送消息
    let chatMessages = context.chatMessages
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

    const nextSendMessages = webSearchEnable && context.searchFunctionMessage ? [...chatMessages, context.searchFunctionMessage] : chatMessages
    const systemPrompts = [artifacts ? artifactsSystemPrompt : '', webSearchEnable ? webSearchSystemPrompt : '', toolCallPrompt].join('\n\n')
    
    context.request = {
      baseUrl: context.provider.apiUrl,
      messages: nextSendMessages,
      apiKey: context.provider.apiKey,
      prompt: systemPrompts,
      model: context.model.value,
      tools: context.tools
    }

    return context
  }

  // 管道函数：处理流式响应
  const processRequest = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
    const streamReader = await chatRequestWithHookV2(context.request, context.signal, beforeFetch, afterFetch)
    
    while (streamReader && true) {
      const { done, value } = await streamReader.read()
      if (done) {
        context.sysMessageEntity.body.content = context.gatherContent
        context.sysMessageEntity.body.reasoning = context.gatherReasoning.trim()
        context.sysMessageEntity.body.toolCallResults = context.toolCallResults
        break
      }
      
      const lines = value
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => line.replace(/^data: /, ""))
        
      for (const line of lines) {
        try {
          const delta = JSON.parse(line).choices?.[0]?.delta
          if (delta) {
            // 检测工具调用
            if (delta.tool_calls && delta.tool_calls.length > 0) {
              if(!context.hasToolCall) context.hasToolCall = true
              if (delta.tool_calls[0].function.name) {
                context.toolCalls.push({
                  function: delta.tool_calls[0].function.name,
                  args: ''
                })
              } else if (delta.tool_calls[0].function.arguments) {
                context.toolCalls[context.toolCalls.length - 1].args += delta.tool_calls[0].function.arguments
              }
            }
            
            // 处理思考标签
            if (context.isContentHasThinkTag) {
              if (!context.gatherReasoning) {
                context.gatherReasoning = context.gatherContent
                context.gatherContent = ''
              }
              if (delta.content) {
                context.gatherReasoning += delta.content
              }
              if (context.gatherReasoning.includes('</think>')) {
                context.gatherReasoning = context.gatherReasoning.replace('</think>', '')
                context.isContentHasThinkTag = false
              }
            } else {
              if (context.gatherContent.includes('<think>')) {
                context.isContentHasThinkTag = true
                if (delta.content) {
                  context.gatherContent = delta.content
                }
              } else if (delta.content) {
                context.gatherContent += delta.content
              } else if (delta.reasoning) {
                context.gatherReasoning += delta.reasoning || ''
              }
            }
          }
          
          // 更新消息显示
          setMessages([...context.messageEntities.slice(0, -1), context.userMessageEntity, { 
            body: { 
              role: 'system', 
              content: context.gatherContent, 
              reasoning: context.gatherReasoning,
              artifatcs: artifacts,
              toolCallResults: context.toolCallResults,
              model: context.model.name
            } 
          }])
        } catch(error: any) {} // 忽略解析失败的行
      }
    }

    return context
  }

  // 管道函数：处理工具调用
  const handleToolCall = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
    while(context.toolCalls.length > 0) {
      console.log('context.toolCalls', context.toolCalls)
      const toolCall = (context.toolCalls.shift())! // 从第一个 tool 开始调用，逐个返回结果
  
      try {
        const results = await window.electron?.ipcRenderer.invoke('mcp-tool-call', { 
          tool: toolCall.function, 
          args: toolCall.args 
        })
        console.log('tool-call-results', results)
        
        // 构建工具调用结果消息
        const mcpToolFunctionMessage: ChatMessage = {
          role: 'function', 
          name: toolCall.function, 
          content: JSON.stringify({...results, functionCallCimpleted: true})
        }
  
        if (!context.toolCallResults) {
          context.toolCallResults = [{
            name: toolCall.function,
            content: results
          }]
        } else {
          context.toolCallResults.push({
            name: toolCall.function,
            content: results
          })
        }

        setMessages([...context.messageEntities.slice(0, -1), context.userMessageEntity, { 
          body: { 
            role: 'system', 
            content: context.gatherContent, 
            reasoning: context.gatherReasoning,
            artifatcs: artifacts,
            toolCallResults: context.toolCallResults,
            model: context.model.name
          } 
        }])
        
        // 更新请求消息，添加工具调用结果
        context.request.messages.push(mcpToolFunctionMessage)
  
      } catch (error: any) {
        console.error('Tool call error:', error)
        context.error = error
        setMessages([...context.messageEntities.slice(0, -1), context.userMessageEntity, { 
          body: { 
            role: 'system', 
            content: context.gatherContent, 
            reasoning: context.gatherReasoning,
            artifatcs: artifacts,
            toolCallResults: context.toolCallResults,
            model: context.model.name
          } 
        }])
      }
    }
    
    // 重置工具调用状态，准备下一轮流式处理
    context.hasToolCall = false
    context.toolCalls = []
    context.toolCallFunctionName = ''
    context.toolCallFunctionArgs = ''
    return context
  }

  // 递归处理流式响应和工具调用
  const processRequestWithToolCall = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
    // 处理流式响应
    context = await processRequest(context)
    
    // 如果有工具调用，处理工具调用后继续处理响应
    if (context.hasToolCall && context.toolCalls.length > 0) {
      context = await handleToolCall(context)
      // 递归调用，处理工具调用后的响应
      return await processRequestWithToolCall(context)
    }
    
    return context
  }

  // 管道函数：最终处理
  const finalize = async (context: ChatPipelineContext): Promise<void> => {
    setLastMsgStatus(true)
    setReadStreamState(false)
    
    // 生成聊天标题
    if (!chatTitle || (chatTitle === 'NewChat')) {
      let title = context.textCtx.substring(0, 30) // roughlyTitle
      if (titleGenerateEnabled) {
        title = await generateTitle(context.textCtx) as string
      } else if (webSearchEnable && context.keywords.length > 0) {
        title = context.keywords[0]
      }
      context.chatEntity.title = title
      setChatTitle(title)
    }

    // 保存消息到本地数据库
    if (context.gatherContent || context.gatherReasoning) {
      context.sysMessageEntity.body.model = context.model.name
      const sysMsgId = await saveMessage(context.sysMessageEntity) as number
      context.chatEntity.messages = [...context.chatEntity.messages, sysMsgId]
      context.chatEntity.updateTime = new Date().getTime()
      updateChat(context.chatEntity)
      updateChatList(context.chatEntity)
    }
  }

  // 重构后的主函数
  const onSubmit = async (textCtx: string, mediaCtx: ClipbordImg[] | string[], tools?: any[]): Promise<void> => {
    console.log('use-tools', tools)
    try {
      let context = await prepareMessageAndChat(textCtx, mediaCtx, tools)
      context = await handleWebSearch(context)
      context = buildRequest(context)
      context = await processRequestWithToolCall(context)
      await finalize(context)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast({
          variant: "destructive",
          title: "Uh oh! Request went wrong.",
          description: `There was a problem with your request. ${error.message}`
        })
      }
      setLastMsgStatus(false)
      setReadStreamState(false)
    }
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
      baseUrl: provider.apiUrl,
      messages: [...messages.slice(messages.length - 3).map(msg => msg.body), {role: 'user', content: chatCtx}],
      apiKey: provider.apiKey,
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
    const model = (titleGenerateModel || selectedModel)!
    let titleProvider = providers.findLast(p => p.name === model.provider)!
    // console.log("generateTitle...")
    const titleReq: IChatRequest = {
      baseUrl: titleProvider.apiUrl,
      content: context,
      prompt: generateTitlePrompt,
      apiKey: titleProvider.apiKey,
      model: model.value,
      stream: false
    }
    const response = await chatRequestWithHook(titleReq, () => {}, () => {})
    const json = await response.json()
    let title: string = json.choices[0].message.content
    setChatTitle(title)
    return title
  }

  return onSubmit
}

export default chatSubmit