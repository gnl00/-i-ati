import { useChatContext } from "@renderer/context/ChatContext"
import { getChatById, updateChat } from "@renderer/db/ChatRepository"
import { saveMessage } from "@renderer/db/MessageRepository"
import { useChatStore } from "@renderer/store"
import { chatRequestWithHook, commonOpenAIChatCompletionRequest } from "@request/index"
import { toast } from '@renderer/components/ui/use-toast'
import { v4 as uuidv4 } from 'uuid'
import { saveChat } from "@renderer/db/ChatRepository"
import { toolCallPrompt, artifactsSystemPrompt, generateTitlePrompt, toolsCallSystemPrompt } from '../constant/prompts'
import { embeddedToolsRegistry } from '@tools/index'

interface ToolCallProps {
  function: string
  args?: string
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
  
  // 请求相关
  request: IChatRequestV2 | IUnifiedRequest
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

function useChatSubmit() {
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
    artifacts,
    setShowLoadingIndicator,
  } = useChatStore()

  // 管道上下文：准备消息
  const prepareMessageAndChat = async (textCtx: string, mediaCtx: ClipbordImg[] | string[], tools?: any[]): Promise<ChatPipelineContext> => {
    // 构建用户消息
    const model = selectedModel!
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
    } else if (model.type === 't2i') {
      console.log('text to image')
      messageBody = {...messageBody, content: textCtx.trim()}
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
    setShowLoadingIndicator(true)

    // init context
    return {
      textCtx,
      mediaCtx,
      tools,
      userMessageEntity,
      messageEntities,
      chatMessages: messageEntities.map(msg => msg.body),
      chatEntity,
      currChatId,
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

  // 管道上下文：构建请求
  const buildRequest = (context: ChatPipelineContext, prompt: string): ChatPipelineContext => {
    let systemPrompts = [artifacts ? artifactsSystemPrompt : '', context.tools ? toolsCallSystemPrompt : '', toolCallPrompt]
    if (prompt) {
      systemPrompts = [prompt, ...systemPrompts]
    }
    context.request = {
      baseUrl: context.provider.apiUrl,
      messages: context.chatMessages,
      apiKey: context.provider.apiKey,
      prompt: systemPrompts.join('\n'),
      model: context.model.value,
      modelType: context.model.type,
      tools: context.tools
    }

    return context
  }

  const processRequestV2 = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
    const response = await commonOpenAIChatCompletionRequest(context.request as IUnifiedRequest, context.signal, beforeFetch, afterFetch)
    setShowLoadingIndicator(false)
    if (false === context.request.stream) {
      const resp = response as IUnifiedResponse
      console.log('non stream resp', resp)
      setMessages([...context.messageEntities, 
        {
          body: { 
            role: 'system', 
            model: context.model.name,
            content: resp.content 
          } 
        }
      ])
    } else {
      for await (const chunk of response) {
        const resp = chunk as IUnifiedResponse
  
        if (resp.toolCalls && resp.toolCalls.length > 0) {
          if(!context.hasToolCall) context.hasToolCall = true

          // 检查是否需要创建新的 tool call
          if (resp.toolCalls[0].function.name) {
            // 检查是否已经存在同名的 tool call
            const existingToolCall = context.toolCalls.find(
              tc => tc.function === resp.toolCalls[0].function.name
            )

            if (!existingToolCall) {
              // 只有不存在时才添加新的 tool call
              context.toolCalls.push({
                function: resp.toolCalls[0].function.name,
                args: ''
              })
            }
          }

          // 追加参数到最后一个 tool call
          if (resp.toolCalls[0].function.arguments && context.toolCalls.length > 0) {
            context.toolCalls[context.toolCalls.length - 1].args += resp.toolCalls[0].function.arguments
          }
        }
  
        if (context.isContentHasThinkTag) {
          if (!context.gatherReasoning) {
            context.gatherReasoning = context.gatherContent
            context.gatherContent = ''
          }
          if (resp.content) {
            context.gatherReasoning += resp.content
          }
          if (context.gatherReasoning.includes('</think>')) {
            context.gatherReasoning = context.gatherReasoning.replace('</think>', '')
            context.isContentHasThinkTag = false
          }
        } else {
          if (context.gatherContent.includes('<think>')) {
            context.isContentHasThinkTag = true
            if (resp.content) {
              context.gatherContent = resp.content
            }
          } else if (resp.content) {
            context.gatherContent += resp.content
          } else if (resp.reasoning) {
            context.gatherReasoning += resp.reasoning || ''
          }
        }
  
        setMessages([...context.messageEntities, 
          {
            body: { 
              role: 'system', 
              model: context.model.name,
              content: context.gatherContent, 
              reasoning: context.gatherReasoning,
              toolCallResults: context.toolCallResults,
            } 
          }
        ])
      }
    }

    context.sysMessageEntity.body.model = context.model.name
    context.sysMessageEntity.body.content = context.gatherContent
    context.sysMessageEntity.body.reasoning = context.gatherReasoning.trim()
    context.sysMessageEntity.body.toolCallResults = context.toolCallResults

    return context
  }
  
  // 管道函数：处理工具调用
  const handleToolCall = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
    while(context.toolCalls.length > 0) {
      console.log('context.toolCalls', JSON.stringify(context.toolCalls), context.toolCalls.length)
      const toolCall = (context.toolCalls.shift())! // 从第一个 tool 开始调用，逐个返回结果
      const startTime = new Date().getTime()
      try {
        let results: any

        // 检查是否是 embedded tool
        if (embeddedToolsRegistry.isRegistered(toolCall.function)) {
          console.log(`[handleToolCall] Using embedded tool handler for: ${toolCall.function}`)

          // 解析参数
          const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : toolCall.args

          // 使用 embedded tool 处理器
          results = await embeddedToolsRegistry.execute(toolCall.function, args)
        } else {
          // 使用 MCP tool 处理器
          console.log(`[handleToolCall] Using MCP tool handler for: ${toolCall.function}`)
          results = await window.electron?.ipcRenderer.invoke('mcp-tool-call', {
            callId: 'call_' + uuidv4(),
            tool: toolCall.function,
            args: toolCall.args
          })
        }

        console.log('tool-call-results', results)
        const timeCosts = new Date().getTime() - startTime

        // 构建工具调用结果消息
        const toolFunctionMessage: ChatMessage = {
          role: 'function',
          name: toolCall.function,
          content: JSON.stringify({...results, functionCallCimpleted: true})
        }
        if (!context.toolCallResults) {
          context.toolCallResults = [{
            name: toolCall.function,
            content: results,
            cost: timeCosts
          }]
        } else {
          context.toolCallResults.push({
            name: toolCall.function,
            content: results,
            cost: timeCosts
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
        context.request.messages.push(toolFunctionMessage)

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
    context = await processRequestV2(context)
    
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
      }
      context.chatEntity.title = title
      setChatTitle(title)
    }

    // 保存消息到本地
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
  const onSubmit = async (textCtx: string, mediaCtx: ClipbordImg[] | string[], options: {tools?: any[], prompt: string}): Promise<void> => {
    console.log('use-tools', options.tools)
    try {
      let context: ChatPipelineContext = await prepareMessageAndChat(textCtx, mediaCtx, options.tools)
      context = buildRequest(context, options.prompt)
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
  const generateTitle = async (context) => {
    const model = (titleGenerateModel || selectedModel)!
    let titleProvider = providers.findLast(p => p.name === model.provider)!
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

export default useChatSubmit