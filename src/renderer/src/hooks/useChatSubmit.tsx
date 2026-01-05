import { useChatContext } from "@renderer/context/ChatContext"
import { getChatById, saveChat, updateChat } from "@renderer/db/ChatRepository"
import { saveMessage } from "@renderer/db/MessageRepository"
import { invokeMcpToolCall } from "@renderer/invoker/ipcInvoker"
import { useChatStore } from "@renderer/store"
import { useAppConfigStore } from "@renderer/store/appConfig"
import { createWorkspace, getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { unifiedChatRequest } from "@request/index"
import { embeddedToolsRegistry } from '@tools/index'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { generateTitlePrompt, systemPrompt as systemPromptBuilder } from '../constant/prompts'

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

  workspacePath: string

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

    // 处理聊天创建/更新
    let currChatId = chatId
    let chatEntity: ChatEntity
    let workspacePath: string = ''
    if (!chatUuid && !chatId) {
      const currChatUuid = uuidv4()
      setChatUuid(currChatUuid)

      // 创建对应的 workspace
      const workspaceResult = await createWorkspace(currChatUuid)
      if (!workspaceResult.success) {
        console.warn(`[Workspace] Failed to create workspace for chat ${currChatUuid}:`, workspaceResult.error)
      }
      workspacePath = workspaceResult.path

      // 先创建聊天记录（不包含消息），保存当前使用的模型
      chatEntity = {
        uuid: currChatUuid,
        title: 'NewChat',
        messages: [],
        model: model.value,
        createTime: new Date().getTime(),
        updateTime: new Date().getTime()
      }
      const saveChatRetVal = await saveChat(chatEntity)
      currChatId = saveChatRetVal as number
      setChatId(currChatId)
      chatEntity.id = currChatId

      // 设置消息的 chatId 和 chatUuid
      userMessageEntity.chatId = currChatId
      userMessageEntity.chatUuid = currChatUuid
    } else {
      const fetchedChat = await getChatById(currChatId!)
      if (!fetchedChat) {
        throw new Error('Chat not found')
      }
      chatEntity = fetchedChat

      // 设置消息的 chatId 和 chatUuid
      userMessageEntity.chatId = currChatId
      userMessageEntity.chatUuid = chatUuid

      // 获取已存在聊天的 workspace 路径
      workspacePath = getWorkspacePath(chatUuid)
    }

    // 保存用户消息（此时 chatId 已经设置）
    const usrMsgId = await saveMessage(userMessageEntity) as number
    let messageEntities = [...messages, userMessageEntity]
    setMessages(messageEntities)

    // 更新聊天的消息列表和模型
    chatEntity.messages = [...chatEntity.messages, usrMsgId]
    chatEntity.model = model.value
    chatEntity.updateTime = new Date().getTime()
    updateChat(chatEntity)

    // 从数据库重新读取最新的 msgCount
    const updatedChat = await getChatById(currChatId!)
    if (updatedChat) {
      chatEntity.msgCount = updatedChat.msgCount
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
        role: 'assistant',
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
      workspacePath,
      request: {} as IChatRequestV2, // 将在后续管道中填充
      provider: providers.findLast(p => p.name === model.provider)!,
      model,
      controller,
      signal: controller.signal,
      gatherContent: '',
      gatherReasoning: '',
      sysMessageEntity: { body: { role: 'assistant', content: '', artifacts: artifacts } },
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
    console.log('workspacePath', context.workspacePath)

    let systemPrompts = [systemPromptBuilder(context.workspacePath)]
    if (prompt) {
      systemPrompts = [prompt, ...systemPrompts]
    }

    // 过滤掉空的 assistant 消息（UI 占位消息），避免发送给 LLM
    // 但要保留带有 toolCalls 的 assistant 消息（即使 content 为空）
    const filteredMessages = context.chatMessages.filter(msg => {
      // 如果是 assistant 角色
      if (msg.role === 'assistant') {
        // 如果有 toolCalls，保留
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          return true
        }
        // 如果没有 toolCalls，但有内容，保留
        if (msg.content && (msg.content as string).trim() !== '') {
          return true
        }
        // 既没有 toolCalls 也没有内容，过滤掉
        return false
      }
      return true
    })

    // // 构建 available external tools 列表（只包含 MCP tools 的简化信息）
    // const availableToolsList = embeddedToolsRegistry.availableTools()

    // // 添加 available tools system 消息（如果有 external tools）
    // if (availableToolsList && availableToolsList.length > 0) {
    //   filteredMessages.splice(0, 0, {
    //     role: 'system',
    //     content: JSON.stringify(availableToolsList)
    //   })
    // }

    // 构建最终的 tools 数组
    // 1. 添加所有 embedded tools 的完整定义（不需要压缩）
    const embeddedTools = embeddedToolsRegistry.getAllTools()
    const finalTools = embeddedTools.map(tool => ({
      ...tool.function
    }))

    // 2. 如果有额外传入的 tools（通常为空，因为 MCP tools 已经注册为 external tools）
    if (context.tools && context.tools.length > 0) {
      finalTools.push(...context.tools)
    }

    context.request = {
      baseUrl: context.provider.apiUrl,
      messages: filteredMessages,
      apiKey: context.provider.apiKey,
      prompt: systemPrompts.join('\n'),
      model: context.model.value,
      modelType: context.model.type,
      tools: finalTools
    }

    return context
  }

  const processRequestV2 = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
    const response = await unifiedChatRequest(context.request as IUnifiedRequest, context.signal, beforeFetch, afterFetch)
    if (false === context.request.stream) {
      const resp = response as IUnifiedResponse
      console.log('non stream resp', resp)
      // 更新最后一个消息（assistant 消息）的内容
      const updatedMessages = [...context.messageEntities]
      updatedMessages[updatedMessages.length - 1] = {
        body: {
          role: 'assistant',
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
            role: 'assistant',
            model: context.model.name,
            content: context.gatherContent,
            reasoning: context.gatherReasoning,
            toolCallResults: context.toolCallResults ? [...context.toolCallResults] : undefined,
          }
        }
        setMessages(updatedMessages)
      }
    }

    context.sysMessageEntity.body.model = context.model.name
    context.sysMessageEntity.body.content = context.gatherContent
    context.sysMessageEntity.body.reasoning = context.gatherReasoning.trim()
    context.sysMessageEntity.body.toolCallResults = context.toolCallResults

    // Step 1: 如果有 tool calls，添加 assistant 的 tool_calls 消息到请求历史
    if (context.hasToolCall && context.toolCalls.length > 0) {
      const assistantToolCallMessage: ChatMessage = {
        role: 'assistant',
        content: context.gatherContent || '',
        toolCalls: context.toolCalls.map(tc => ({
          id: tc.id || `call_${uuidv4()}`,
          type: 'function',
          function: {
            name: tc.function,
            arguments: tc.args
          }
        }))
      }

      // 添加到请求历史（用于发送给 LLM）
      context.request.messages.push(assistantToolCallMessage)

      // 替换 UI 中最后一个 assistant 消息（而不是新增），避免出现多个 model-badge
      const lastIndex = context.messageEntities.length - 1
      context.messageEntities[lastIndex] = {
        body: {
          ...assistantToolCallMessage,
          model: context.model.name
        }
      }
      setMessages([...context.messageEntities])
    }

    return context
  }

  const handleToolCallResult = (functionName: string, results: any) => {
    return functionName === 'web_search'
      ? formatWebSearchForLLM(results)  // Web Search 特殊处理
      : JSON.stringify({ ...results, functionCallCompleted: true })  // 其他工具保持不变
  }

  const decodeEscapedString = (value: string) =>
    value
      .replace(/\\r/g, '\r')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')

  const normalizeToolArgs = (args: any) => {
    if (Array.isArray(args)) return args.map(normalizeToolArgs)
    if (args && typeof args === 'object') {
      const normalized: Record<string, any> = {}
      for (const [key, val] of Object.entries(args)) {
        normalized[key] =
          typeof val === 'string' ? decodeEscapedString(val) : normalizeToolArgs(val)
      }
      return normalized
    }
    return args
  }

  // 管道函数：处理工具调用
  const handleToolCall = async (context: ChatPipelineContext): Promise<ChatPipelineContext> => {
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
          const normalizedArgs = normalizeToolArgs(args)
          // 使用 embedded tool 处理器
          results = await embeddedToolsRegistry.execute(toolCall.function, normalizedArgs)
        } else {
          // 使用 MCP tool 处理器
          console.log(`[handleToolCall] Using MCP tool handler for: ${toolCall.function}`)
          results = await invokeMcpToolCall({
            callId: 'call_' + uuidv4(),
            tool: toolCall.function,
            args: toolCall.args
          })
        }

        console.log('tool-call-results', results)
        const timeCosts = new Date().getTime() - startTime

        // Step 2: 构建工具调用结果消息，必须包含 toolCallId
        const toolFunctionMessage: ChatMessage = {
          role: 'tool',
          name: toolCall.function,
          toolCallId: toolCall.id || `call_${uuidv4()}`,
          content: handleToolCallResult(toolCall.function, results)
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
        const currentBody = updatedMessages[updatedMessages.length - 1].body
        updatedMessages[updatedMessages.length - 1] = {
          body: {
            role: 'assistant',
            content: context.gatherContent,
            reasoning: context.gatherReasoning,
            artifacts: artifacts,
            toolCallResults: context.toolCallResults ? [...context.toolCallResults] : undefined, // 创建新数组，触发 React 更新
            toolCalls: currentBody.toolCalls, // 保留 toolCalls 字段
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
        const currentBody = updatedMessages[updatedMessages.length - 1].body
        updatedMessages[updatedMessages.length - 1] = {
          body: {
            role: 'assistant',
            content: context.gatherContent,
            reasoning: context.gatherReasoning,
            artifacts: artifacts,
            toolCallResults: context.toolCallResults ? [...context.toolCallResults] : undefined, // 创建新数组，触发 React 更新
            toolCalls: currentBody.toolCalls, // 保留 toolCalls 字段
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
      // 设置消息的 chatId 和 chatUuid
      context.sysMessageEntity.chatId = context.chatEntity.id
      context.sysMessageEntity.chatUuid = context.chatEntity.uuid
      const sysMsgId = await saveMessage(context.sysMessageEntity) as number
      context.chatEntity.messages = [...context.chatEntity.messages, sysMsgId]
      context.chatEntity.model = context.model.value
      context.chatEntity.updateTime = new Date().getTime()
      updateChat(context.chatEntity)

      // 从数据库重新读取最新的 msgCount
      const updatedChat = await getChatById(context.chatEntity.id!)
      if (updatedChat) {
        context.chatEntity.msgCount = updatedChat.msgCount
      }
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

    // Map provider name to providerType (most are OpenAI-compatible)
    const providerTypeMap: Record<string, ProviderType> = {
      'Anthropic': 'claude',
      'Claude': 'claude'
    }
    const providerType = providerTypeMap[titleProvider.name] || 'openai'

    const titleReq: IUnifiedRequest = {
      providerType,
      apiVersion: 'v1',
      baseUrl: titleProvider.apiUrl,
      apiKey: titleProvider.apiKey,
      model: model.value,
      prompt: generateTitlePrompt,
      messages: [{ role: 'user', content: context }],
      stream: false,
      options: {
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.7
      }
    }
    const response = await unifiedChatRequest(titleReq, null, () => { }, () => { })
    let title: string = response.content
    setChatTitle(title)
    return title
  }

  return onSubmit
}

export default useChatSubmit