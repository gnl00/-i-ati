import { RequestMessageBuilder } from '@shared/services/RequestMessageBuilder'
import {
  getEffectiveThinkingLevel,
  getRequestAdapterThinkingCapability,
  toUnifiedRequestThinkingOption
} from '@shared/plugins/requestAdapterThinking'
import { pluginDb } from '@main/db/plugins'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { AppConfigStore } from '../config'
import {
  AwakeContextProvider,
  CompressionSummaryResolver,
  KnowledgebaseContextProvider,
  SystemEnvironmentContextProvider,
  SystemPromptComposer,
  UserInfoPromptProvider,
  InitialTranscriptSeedBuilder,
  ToolListBuilder
} from './request'
import { LoadedSkillsContextProvider } from './request/LoadedSkillsContextProvider'
import type { HostRunInputState, RunEnvironment, StepBootstrap } from './types'
import type { AgentRequestSpec } from '@main/agent/runtime/request/AgentRequestSpec'
import type { ChatInitialTranscriptSeed } from '@main/agent/contracts'

const SCHEDULE_EXECUTION_INSTRUCTION = [
  '## Schedule Execution Context',
  'This input was triggered by an already-created scheduled task.',
  'Treat the incoming user message as the execution target of that task.',
  'Do not call schedule_create again unless the user explicitly asks to create a new or recurring schedule.'
].join('\n')

export type RunRequestBuildResult = {
  requestSpec: AgentRequestSpec
  initialTranscriptSeed: ChatInitialTranscriptSeed[]
}

export class RunRequestFactory {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly compressionSummaryResolver = new CompressionSummaryResolver(),
    private readonly systemPromptComposer = new SystemPromptComposer(),
    private readonly toolListBuilder = new ToolListBuilder(),
    private readonly initialTranscriptSeedBuilder = new InitialTranscriptSeedBuilder(),
    private readonly loadedSkillsContextProvider = new LoadedSkillsContextProvider(),
    private readonly userInfoPromptProvider = new UserInfoPromptProvider(),
    private readonly systemEnvironmentContextProvider = new SystemEnvironmentContextProvider(),
    private readonly awakeContextProvider = new AwakeContextProvider(),
    private readonly knowledgebaseContextProvider = new KnowledgebaseContextProvider()
  ) {}

  async build(
    environment: RunEnvironment,
    step: StepBootstrap,
    input: HostRunInputState
  ): Promise<RunRequestBuildResult> {
    const mergedUserInstruction = this.mergeRequestUserInstruction(input)
    const config = this.appConfigStore.requireConfig()
    const compressionSummary = this.compressionSummaryResolver.resolve(config, environment.chat.id)
    const systemPrompts = await this.systemPromptComposer.compose(environment.chat.id)
    const systemEnvironmentContext = this.systemEnvironmentContextProvider.build({
      workspacePath: environment.workspacePath
    })
    const [loadedSkillsContext, userInfoContext, knowledgebaseContext, awakeContext] = await Promise.all([
      this.loadedSkillsContextProvider.build(environment.chat.id),
      this.userInfoPromptProvider.buildContext(),
      this.knowledgebaseContextProvider.build(input.textCtx),
      this.awakeContextProvider.build({
        chat: environment.chat,
        workspacePath: environment.workspacePath,
        currentQuery: input.textCtx,
        compressionSummary
      })
    ])

    const requestMessageBuild = new RequestMessageBuilder()
      .setSystemPrompts(systemPrompts)
      .setEphemeralContextMessages(
        [loadedSkillsContext, userInfoContext, knowledgebaseContext, systemEnvironmentContext, awakeContext]
          .filter((message): message is ChatMessage => Boolean(message))
      )
      .setUserInstruction(mergedUserInstruction)
      .setMessages(step.messageBuffer)
      .setCompressionSummary(compressionSummary)
      .build()

    return {
      requestSpec: {
        adapterPluginId: environment.modelContext.providerDefinition.adapterPluginId,
        baseUrl: environment.modelContext.account.apiUrl,
        systemPrompt: requestMessageBuild.systemPrompt,
        apiKey: environment.modelContext.account.apiKey,
        model: environment.modelContext.model.id,
        modelType: environment.modelContext.model.type,
        tools: this.toolListBuilder.build(input.tools),
        options: this.resolveRequestOptions(environment, input.options),
        stream: input.stream,
        payloadExtensions: environment.modelContext.providerDefinition.payloadExtensions,
        requestOverrides: environment.modelContext.providerDefinition.requestOverrides
      },
      initialTranscriptSeed: this.initialTranscriptSeedBuilder.build(requestMessageBuild.chatMessages)
    }
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

  private mergeRequestUserInstruction(input: HostRunInputState): string | undefined {
    const baseInstruction = input.userInstruction?.trim()

    if (input.source !== MESSAGE_SOURCE.SCHEDULE) {
      return baseInstruction || undefined
    }

    return [baseInstruction, SCHEDULE_EXECUTION_INSTRUCTION]
      .filter((part): part is string => Boolean(part && part.trim().length > 0))
      .join('\n\n')
  }
}
