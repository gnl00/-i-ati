import { RequestMessageBuilder } from '@shared/services/RequestMessageBuilder'
import {
  getRequestAdapterThinkingCapability,
  modelSupportsThinking
} from '@shared/plugins/requestAdapterThinking'
import { pluginDb } from '@main/db/plugins'
import { AppConfigStore } from '../config'
import {
  CompressionSummaryResolver,
  SystemPromptComposer,
  ToolListBuilder
} from './request'
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
    private readonly toolListBuilder = new ToolListBuilder()
  ) {}

  async build(
    environment: RunEnvironment,
    step: StepBootstrap,
    input: HostRunInputState
  ): Promise<IUnifiedRequest> {
    const mergedUserInstruction = this.mergeRequestUserInstruction(input)
    const config = this.appConfigStore.requireConfig()
    const compressionSummary = this.compressionSummaryResolver.resolve(config, environment.chat.id)
    const systemPrompts = await this.systemPromptComposer.compose(
      environment.workspacePath,
      environment.chat.id,
      mergedUserInstruction,
      input.textCtx
    )

    const requestMessages = new RequestMessageBuilder()
      .setSystemPrompts(systemPrompts)
      .setUserInstruction(environment.chat.userInstruction)
      .setMessages(step.messageBuffer)
      .setCompressionSummary(compressionSummary)
      .build()

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
    if (!options?.thinkingLevel) {
      return options
    }

    const thinkingCapability = getRequestAdapterThinkingCapability({
      plugins: pluginDb.getPlugins(),
      pluginId: environment.modelContext.providerDefinition.adapterPluginId
    })

    if (
      modelSupportsThinking(environment.modelContext.model, thinkingCapability)
      && thinkingCapability?.levels.includes(options.thinkingLevel)
    ) {
      return options
    }

    const { thinkingLevel: _thinkingLevel, ...restOptions } = options
    return Object.keys(restOptions).length > 0 ? restOptions : undefined
  }

  private mergeRequestUserInstruction(input: HostRunInputState): string | undefined {
    const baseInstruction = input.userInstruction?.trim()

    if (input.source !== 'schedule') {
      return baseInstruction || undefined
    }

    return [baseInstruction, SCHEDULE_EXECUTION_INSTRUCTION]
      .filter((part): part is string => Boolean(part && part.trim().length > 0))
      .join('\n\n')
  }
}
