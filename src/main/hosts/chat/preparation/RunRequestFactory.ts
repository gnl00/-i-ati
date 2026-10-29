import { abortableWait } from '@shared/utils/abortableWait'
import { expandTextAttachments } from '@shared/chat/textAttachments'
import { buildContextMessages } from './request/buildContextMessages'
import {
  getEffectiveThinkingLevel,
  getRequestAdapterThinkingCapability,
  toUnifiedRequestThinkingOption
} from '@shared/plugins/requestAdapterThinking'
import { chatDb } from '@main/db/chat'
import { formatRequestContext } from '@main/agent/contracts/HostRuntimeContracts'
import { pluginDb } from '@main/db/plugins'
import { MESSAGE_SOURCE, isInteractiveMessageSource } from '@shared/messages/messageSources'
import {
  AwakeContextProvider,
  AvailableImagesContextProvider,
  CompressionSummaryResolver,
  KnowledgebaseContextProvider,
  SystemEnvironmentContextProvider,
  SystemPromptComposer,
  UserInfoPromptProvider,
  ToolListBuilder
} from './request'
import { LoadedSkillsContextProvider } from './request/LoadedSkillsContextProvider'
import type { HostRunInputState, RunEnvironment, StepBootstrap } from './types'
import type { AgentRequestSpec } from '@main/agent/contracts/HostRuntimeContracts'

const SCHEDULE_EXECUTION_INSTRUCTION = [
  '## Schedule Execution Context',
  'This input was triggered by an already-created scheduled task.',
  'Treat the incoming user message as the execution target of that task.',
  'Reuse the existing scheduled task. Call schedule with action=create only when the user explicitly asks to create a new or recurring schedule.'
].join('\n')

export type RunRequestBuildResult = {
  emotionEnabled: boolean
  requestSpec: AgentRequestSpec
  contextMessages: ChatMessage[]
}

type PreparedRequestContext = {
  emotionEnabled: boolean
  requestSpec: AgentRequestSpec
  contexts: ChatMessage[]
  compressionSummary: CompressedSummaryEntity | null
  userInstruction?: string
  visionAnalysisAvailable: boolean
}

export class RunRequestFactory {
  constructor(
    private readonly compressionSummaryResolver = new CompressionSummaryResolver(),
    private readonly systemPromptComposer = new SystemPromptComposer(),
    private readonly toolListBuilder = new ToolListBuilder(),
    private readonly loadedSkillsContextProvider = new LoadedSkillsContextProvider(),
    private readonly userInfoPromptProvider = new UserInfoPromptProvider(),
    private readonly systemEnvironmentContextProvider = new SystemEnvironmentContextProvider(),
    private readonly awakeContextProvider = new AwakeContextProvider(),
    private readonly knowledgebaseContextProvider = new KnowledgebaseContextProvider(),
    private readonly availableImagesContextProvider = new AvailableImagesContextProvider()
  ) {}

  async prepare(
    environment: RunEnvironment,
    input: HostRunInputState,
    signal?: AbortSignal
  ): Promise<PreparedRequestContext> {
    signal?.throwIfAborted()
    const mergedUserInstruction = this.mergeRequestUserInstruction(input, environment.chat)
    const config = environment.config
    const emotionEnabled = config.emotion?.enabled ?? true
    const toolConditions = {
      emotionSystemEnabled: emotionEnabled,
      visionAnalysisAvailable: Boolean(config.tools?.visionModel),
      interactiveInputAvailable: isInteractiveMessageSource(input.source)
    }
    const compressionSummary = this.compressionSummaryResolver.resolve(config, environment.chat.id)
    const tools = this.toolListBuilder.build(input.tools, { conditions: toolConditions, selection: input.toolSelection })
    const requestOptions = this.resolveRequestOptions(environment, input.options)
    const currentQuery = expandTextAttachments(input.textCtx, input.textAttachments)
    let systemPromptParts: AgentRequestSpec['systemPromptParts']
    const systemEnvironmentContext = this.systemEnvironmentContextProvider.build({
      workspacePath: environment.workspacePath
    })
    const [systemPrompts, loadedSkillsContext, userInfoContext, knowledgebaseContext, awakeContext] =
      await abortableWait(() => Promise.all([
        this.systemPromptComposer.compose(emotionEnabled, parts => { systemPromptParts = parts }),
        this.loadedSkillsContextProvider.build(environment.chat.id),
        this.userInfoPromptProvider.buildContext(config),
        this.knowledgebaseContextProvider.build(currentQuery, signal, config),
        this.awakeContextProvider.build({
          signal,
          emotionEnabled,
          chat: environment.chat,
          workspacePath: environment.workspacePath,
          currentQuery,
          compressionSummary
        })
      ]), signal)
    signal?.throwIfAborted()
    const contexts = [loadedSkillsContext, userInfoContext, knowledgebaseContext,
      systemEnvironmentContext, awakeContext].filter((message): message is ChatMessage => Boolean(message))
    return {
      emotionEnabled,
      requestSpec: {
        adapterPluginId: environment.modelContext.providerDefinition.adapterPluginId,
        baseUrl: environment.modelContext.account.apiUrl,
        systemPrompt: systemPrompts
          .map((prompt) => prompt.trim())
          .filter(Boolean)
          .join('\n'),
        systemPromptParts,
        apiKey: environment.modelContext.account.apiKey,
        model: environment.modelContext.model.id,
        contextWindowTokens: environment.modelContext.model.contextWindowTokens,
        contextCompression: Boolean(
          config.compression?.enabled && config.compression?.autoCompress
        ),
        modelType: environment.modelContext.model.type,
        tools,
        options: requestOptions,
        stream: input.stream,
        payloadExtensions: environment.modelContext.providerDefinition.payloadExtensions,
        requestOverrides: environment.modelContext.providerDefinition.requestOverrides
      },
      contexts,
      compressionSummary,
      userInstruction: mergedUserInstruction,
      visionAnalysisAvailable: toolConditions.visionAnalysisAvailable
    }
  }

  build(step: StepBootstrap, prepared: PreparedRequestContext, signal?: AbortSignal): RunRequestBuildResult {
    signal?.throwIfAborted()
    const { compressionSummary, userInstruction } = prepared
    const availableImagesContext = this.availableImagesContextProvider.build(
      step.messageBuffer,
      compressionSummary,
      prepared.visionAnalysisAvailable
    )

    const contexts = [
      ...prepared.contexts,
      availableImagesContext
    ].filter((message): message is ChatMessage => Boolean(message))
    // Match buildContextMessages: vision observations can be the final user record.
    const currentUser = step.messageBuffer.findLast(message => message.body.role === 'user')
    if (currentUser?.id != null && !currentUser.body.requestContextSnapshot) {
      const snapshot = formatRequestContext(contexts.flatMap(message =>
        typeof message.content === 'string'
          ? [message.content]
          : message.content.filter(part => part.type === 'text').map(part => part.text || '')
      ))
      if (snapshot) {
        currentUser.body = { ...currentUser.body, requestContextSnapshot: snapshot }
        chatDb.updateMessage(currentUser)
      }
    }
    const contextMessages = buildContextMessages({
      messages: step.messageBuffer,
      contexts,
      userInstruction,
      summary: compressionSummary
    })

    return { emotionEnabled: prepared.emotionEnabled, requestSpec: prepared.requestSpec, contextMessages }
  }

  private resolveRequestOptions(
    environment: RunEnvironment,
    options: IUnifiedRequest['options'] | undefined
  ): IUnifiedRequest['options'] | undefined {
    const thinkingCapability = getRequestAdapterThinkingCapability({
      plugins: pluginDb.getPlugins(),
      pluginId: environment.modelContext.providerDefinition.adapterPluginId,
      baseUrl: environment.modelContext.account.apiUrl,
      modelId: environment.modelContext.model.id,
      payloadExtensions: environment.modelContext.providerDefinition.payloadExtensions
    })
    const requestedThinkingLevel = options?.thinking
      ? options.thinking.enabled === false
        ? 'none'
        : options.thinking.effort
      : undefined
    const effectiveThinkingLevel = getEffectiveThinkingLevel(
      environment.modelContext.model,
      thinkingCapability,
      requestedThinkingLevel
    )
    const { thinking: _thinking, ...restOptions } = options ?? {}

    if (!effectiveThinkingLevel) {
      return Object.keys(restOptions).length > 0 ? restOptions : undefined
    }
    const thinking = toUnifiedRequestThinkingOption(effectiveThinkingLevel)
    if (!thinking) {
      return Object.keys(restOptions).length > 0 ? restOptions : undefined
    }

    return {
      ...restOptions,
      thinking
    }
  }

  private mergeRequestUserInstruction(input: HostRunInputState, chat: ChatEntity): string | undefined {
    const baseInstruction = [...new Set([
      input.chatUserInstruction ?? chat.userInstruction,
      input.userInstruction
    ].map(part => part?.trim()).filter(Boolean))].join('\n\n')

    if (input.source !== MESSAGE_SOURCE.SCHEDULE) {
      return baseInstruction || undefined
    }

    return [baseInstruction, SCHEDULE_EXECUTION_INSTRUCTION]
      .filter((part): part is string => Boolean(part && part.trim().length > 0))
      .join('\n\n')
  }
}
