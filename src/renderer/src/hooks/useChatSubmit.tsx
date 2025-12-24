import { useChatContext } from "@renderer/context/ChatContext"
import { getChatById, saveChat, updateChat } from "@renderer/db/ChatRepository"
import { saveMessage } from "@renderer/db/MessageRepository"
import { useChatStore } from "@renderer/store"
import { useAppConfigStore } from "@renderer/store/appConfig"
import { chatRequestWithHook, commonOpenAIChatCompletionRequest } from "@request/index"
import { embeddedToolsRegistry } from '@tools/index'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { generateTitlePrompt, toolCallPrompt, toolsCallSystemPrompt } from '../constant/prompts'

interface ToolCallProps {
  id?: string
  index?: number
  function: string
  args: string
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

/**
 * 格式化 Web Search 结果供 LLM 使用
 * 只发送成功的结果，截断内容以节省 tokens
 */
function formatWebSearchForLLM(response: any): string {
  if (!response.success || !response.results || response.results.length === 0) {
    return JSON.stringify({
      success: false,
      error: response.error || 'No results found',
      functionCallCompleted: true
    })
  }

  // 只包含成功的结果
  const formattedResults = response.results
    .filter((r: any) => r.success)
    .map((r: any, index: number) => ({
      index: index + 1,
      title: r.title,
      link: r.link,
      snippet: r.snippet,
      content: r.content.substring(0, 2000)  // 限制长度节省 tokens
    }))

  return JSON.stringify({
    success: true,
    query: response.results[0]?.query || '',
    results: formattedResults,
    totalResults: response.results.length,
    successfulResults: formattedResults.length,
    functionCallCompleted: true
  })
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
    messages,
    selectedModel,
    setMessages,
    setFetchState,
    setCurrentReqCtrl,
    setReadStreamState,
    artifacts,
    setShowLoadingIndicator,
  } = useChatStore()
  const {
    providers,
    titleGenerateModel,
    titleGenerateEnabled,
  } = useAppConfigStore()

  // 管道上下文：准备消息
  const prepareMessageAndChat = async (textCtx: string, mediaCtx: ClipbordImg[] | string[], tools?: any[]): Promise<ChatPipelineContext> => {
    // 构建用户消息
    const model = selectedModel!
    let messageBody: ChatMessage = { role: "user", content: '' }
    if (model.type === 'llm') {
      messageBody = { ...messageBody, content: textCtx.trim() }
    } else if (model.type === 'vlm') {
      const imgContents: VLMContent[] = []
      mediaCtx.forEach(imgBase64 => {
        imgContents.push({ type: 'image_url', image_url: { url: imgBase64 as string, detail: 'auto' } })
      })
      messageBody = {
        ...messageBody,
        content: [...imgContents, { type: 'text', text: textCtx.trim() }]
      }
    } else if (model.type === 't2i') {
      console.log('text to image')
      messageBody = { ...messageBody, content: textCtx.trim() }
    } else {
      throw new Error('Unsupported model type')
    }

    const userMessageEntity: MessageEntity = { body: messageBody }
    const usrMsgId = await saveMessage(userMessageEntity) as number
    let messageEntities = [...messages, userMessageEntity]
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

    // 立即创建一个空的 assistant 消息，包含 model 信息
    // 这样 model-badge 可以立即显示并开始闪烁动画
    const initialAssistantMessage: MessageEntity = {
      body: {
        role: 'system',
        model: model.name,
        content: '',
        artifacts: artifacts
      }
    }
    messageEntities = [...messageEntities, initialAssistantMessage]
    setMessages(messageEntities)

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
      sysMessageEntity: { body: { role: 'system', content: '', artifacts: artifacts } },
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
    let systemPrompts = [context.tools ? toolsCallSystemPrompt : '', toolCallPrompt]
    if (prompt) {
      systemPrompts = [prompt, ...systemPrompts]
    }

    // 过滤掉空的 system 消息（UI 占位消息），避免发送给 LLM
    const filteredMessages = context.chatMessages.filter(msg => {
      // 如果是 system 角色且内容为空，则过滤掉
      if (msg.role === 'system' && (!msg.content || msg.content.trim() === '')) {
        return false
      }
      return true
    })

    context.request = {
      baseUrl: context.provider.apiUrl,
      messages: filteredMessages,
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
    if (false === context.request.stream) {
      const resp = response as IUnifiedResponse
      console.log('non stream resp', resp)
      // 更新最后一个消息（assistant 消息）的内容
      const updatedMessages = [...context.messageEntities]
      updatedMessages[updatedMessages.length - 1] = {
        body: {
          role: 'system',
          model: context.model.name,
          content: resp.content
        }
      }
      setMessages(updatedMessages)
    } else {
      for await (const chunk of response) {
        // Check if request was aborted before processing each chunk
        if (context.signal.aborted) {
          // console.log('[processRequestV2] Abort detected, stopping stream processing')
          throw new DOMException('Request aborted', 'AbortError')
        }

        const resp = chunk as IUnifiedResponse
        // console.log('resp', resp)
        if (resp.toolCalls && resp.toolCalls.length > 0) {
          if (!context.hasToolCall) context.hasToolCall = true

          resp.toolCalls.forEach(tc => {
            // Find existing tool call by index or id
            const existingToolCall = context.toolCalls.find(t =>
              (tc.index !== undefined && t.index === tc.index) ||
              (tc.id && t.id === tc.id)
            )

            if (existingToolCall) {
              if (tc.function.name) existingToolCall.function = tc.function.name
              if (tc.function.arguments) existingToolCall.args += tc.function.arguments
            } else {
              context.toolCalls.push({
                id: tc.id,
                index: tc.index,
                function: tc.function.name || '',
                args: tc.function.arguments || ''
              })
            }
          })
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

        // 更新最后一个消息（assistant 消息）的内容 而不是添加新的消息
        const updatedMessages = [...context.messageEntities]
        updatedMessages[updatedMessages.length - 1] = {
          body: {
            role: 'system',
            model: context.model.name,
            content: context.gatherContent,
            reasoning: context.gatherReasoning,
            toolCallResults: context.toolCallResults,
          }
        }
        setMessages(updatedMessages)
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
    // Get fetchCounts from appConfig for web_search
    const { appConfig } = useAppConfigStore.getState()
    const fetchCounts = appConfig?.tools?.maxWebSearchItems ?? 3

    while (context.toolCalls.length > 0) {
      // Check if request was aborted before processing each tool call
      if (context.signal.aborted) {
        // console.log('[handleToolCall] Abort detected, stopping tool call processing')
        throw new DOMException('Request aborted', 'AbortError')
      }

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

          // Inject fetchCounts for web_search
          if (toolCall.function === 'web_search') {
            args.fetchCounts = fetchCounts
          }

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
          content: toolCall.function === 'web_search'
            ? formatWebSearchForLLM(results)  // Web Search 特殊处理
            : JSON.stringify({ ...results, functionCallCompleted: true })  // 其他工具保持不变
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

        // 更新最后一个消息（assistant 消息）
        const updatedMessages = [...context.messageEntities]
        updatedMessages[updatedMessages.length - 1] = {
          body: {
            role: 'system',
            content: context.gatherContent,
            reasoning: context.gatherReasoning,
            artifacts: artifacts,
            toolCallResults: context.toolCallResults,
            model: context.model.name
          }
        }
        setMessages(updatedMessages)

        // 更新请求消息，添加工具调用结果
        context.request.messages.push(toolFunctionMessage)

      } catch (error: any) {
        console.error('Tool call error:', error)
        context.error = error
        // 更新最后一个消息（assistant 消息）
        const updatedMessages = [...context.messageEntities]
        updatedMessages[updatedMessages.length - 1] = {
          body: {
            role: 'system',
            content: context.gatherContent,
            reasoning: context.gatherReasoning,
            artifacts: artifacts,
            toolCallResults: context.toolCallResults,
            model: context.model.name
          }
        }
        setMessages(updatedMessages)
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
    } else {
      setShowLoadingIndicator(false)
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
  const onSubmit = async (textCtx: string, mediaCtx: ClipbordImg[] | string[], options: { tools?: any[], prompt: string }): Promise<void> => {
    console.log('use-tools', options.tools)
    try {
      let context: ChatPipelineContext = await prepareMessageAndChat(textCtx, mediaCtx, options.tools)
      context = buildRequest(context, options.prompt)
      context = await processRequestWithToolCall(context)
      await finalize(context)
    } catch (error: any) {
      // console.log('[onSubmit] Error caught:', error.name, error.message)

      // Unified state cleanup - happens for both AbortError and other errors
      // console.log('[onSubmit] Cleaning up all states...')
      setCurrentReqCtrl(undefined)
      setReadStreamState(false)
      setFetchState(false)
      setShowLoadingIndicator(false)
      setLastMsgStatus(false)

      // Handle different error types
      if (error.name === 'AbortError') {
        // console.log('[onSubmit] Request was aborted by user')
        // toast({
        //   variant: "destructive",
        //   title: "Request stopped",
        //   description: "The request has been cancelled successfully."
        // })
      } else {
        // console.error('[onSubmit] Request failed with error:', error)
        // toast({
        //   variant: "destructive",
        //   title: "Request Exception.",
        //   description: `${error.message}`
        // })
        toast.error(error.message)
      }
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
    const response = await chatRequestWithHook(titleReq, () => { }, () => { })
    const json = await response.json()
    let title: string = json.choices[0].message.content
    setChatTitle(title)
    return title
  }

  return onSubmit
}

export default useChatSubmit