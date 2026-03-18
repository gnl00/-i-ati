import { RequestMessageBuilder } from '@shared/services/RequestMessageBuilder'
import { AppConfigStore } from '../config'
import {
  CompressionSummaryResolver,
  SystemPromptComposer,
  ToolListBuilder
} from './request'
import type { ChatRunInputState, RunEnvironment, StepBootstrap } from './types'

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
    input: ChatRunInputState
  ): Promise<IUnifiedRequest> {
    const config = this.appConfigStore.requireConfig()
    const compressionSummary = this.compressionSummaryResolver.resolve(config, environment.chat.id)
    const systemPrompts = await this.systemPromptComposer.compose(
      environment.workspacePath,
      environment.chat.id,
      input.userInstruction
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
      userInstruction: input.userInstruction,
      tools: this.toolListBuilder.build(input.tools),
      options: input.options,
      stream: input.stream,
      requestOverrides: environment.modelContext.providerDefinition.requestOverrides
    }
  }
}
