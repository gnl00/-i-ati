import {
  RequestMessageBuilder,
  UnifiedRequestMessageMaterializer
} from '@shared/services/RequestMessageBuilder'
import {
  getEffectiveThinkingLevel,
  getRequestAdapterThinkingCapability
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
  ToolListBuilder
} from './request'
import { LoadedSkillsContextProvider } from './request/LoadedSkillsContextProvider'
import type { HostRunInputState, RunEnvironment, StepBootstrap } from './types'

const SCHEDULE_EXECUTION_INSTRUCTION = [
  '## Schedule Execution Context',
  'This input was triggered by an already-created scheduled task.',
  'Treat the incoming user message as the execution target of that task.',
  'Do not call schedule_create again unless the user explicitly asks to create a new or recurring schedule.'
].join('\n')

export class RunRequestFactory {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly compressionSummaryResolver = new CompressionSummaryResolver(),
    private readonly systemPromptComposer = new SystemPromptComposer(),
    private readonly toolListBuilder = new ToolListBuilder(),
    private readonly loadedSkillsContextProvider = new LoadedSkillsContextProvider(),
    private readonly systemEnvironmentContextProvider = new SystemEnvironmentContextProvider(),
    private readonly awakeContextProvider = new AwakeContextProvider(),
    private readonly knowledgebaseContextProvider = new KnowledgebaseContextProvider(),
    private readonly unifiedRequestMessageMaterializer = new UnifiedRequestMessageMaterializer()
  ) {}

  async build(
    environment: RunEnvironment,
    step: StepBootstrap,
    input: HostRunInputState
  ): Promise<IUnifiedRequest> {
    const mergedUserInstruction = this.mergeRequestUserInstruction(input)
    const config = this.appConfigStore.requireConfig()
    const compressionSummary = this.compressionSummaryResolver.resolve(config, environment.chat.id)
    const systemPrompts = await this.systemPromptComposer.compose(environment.chat.id)
    const systemEnvironmentContext = this.systemEnvironmentContextProvider.build({
      workspacePath: environment.workspacePath
    })
    const [loadedSkillsContext, knowledgebaseContext, awakeContext] = await Promise.all([
      this.loadedSkillsContextProvider.build(environment.chat.id),
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
        [systemEnvironmentContext, loadedSkillsContext, knowledgebaseContext, awakeContext]
          .filter((message): message is ChatMessage => Boolean(message))
      )
      .setUserInstruction(mergedUserInstruction)
      .setMessages(step.messageBuffer)
      .setCompressionSummary(compressionSummary)
      .build()
    const requestMessages = this.unifiedRequestMessageMaterializer.materialize(requestMessageBuild)

    return {
      adapterPluginId: environment.modelContext.providerDefinition.adapterPluginId,
      baseUrl: environment.modelContext.account.apiUrl,
      systemPrompt: requestMessages.systemPrompt,
      messages: requestMessages.messages,
      apiKey: environment.modelContext.account.apiKey,
      model: environment.modelContext.model.id,
      modelType: environment.modelContext.model.type,
      userInstruction: mergedUserInstruction,
      tools: this.toolListBuilder.build(input.tools),
      options: this.resolveRequestOptions(environment, input.options),
      stream: input.stream,
      requestOverrides: environment.modelContext.providerDefinition.requestOverrides
    }
  }

  private resolveRequestOptions(
    environment: RunEnvironment,
    options: IUnifiedRequest['options'] | undefined
  ): IUnifiedRequest['options'] | undefined {
    const thinkingCapability = getRequestAdapterThinkingCapability({
      plugins: pluginDb.getPlugins(),
      pluginId: environment.modelContext.providerDefinition.adapterPluginId
    })
    const effectiveThinkingLevel = getEffectiveThinkingLevel(
      environment.modelContext.model,
      thinkingCapability,
      options?.thinkingLevel
    )
    const { thinkingLevel: _thinkingLevel, ...restOptions } = options ?? {}

    if (!effectiveThinkingLevel) {
      return Object.keys(restOptions).length > 0 ? restOptions : undefined
    }

    return {
      ...restOptions,
      thinkingLevel: effectiveThinkingLevel
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
