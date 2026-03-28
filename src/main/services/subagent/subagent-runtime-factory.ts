import DatabaseService from '@main/services/DatabaseService'
import { AgentRunKernel } from '@main/services/agentCore/run-kernel'
import { AgentStepRuntimeFactory } from '@main/services/agentCore/execution'
import { ChunkParser } from '@main/services/agentCore/execution/parser'
import { ToolExecutor } from '@main/services/agentCore/tools'
import type {
  AgentMessageEventSink,
  AgentStepEventListener,
  ConversationStore,
  ToolConfirmationRequester
} from '@main/services/agentCore/ports'
import type { ToolExecutionProgress } from '@main/services/agentCore/tools'
import type { RunSpec } from '@main/services/agentCore/types'
import { extractContentFromSegments } from '@main/services/agentCore/execution/parser/segment-content'
import { AssistantStepMessageManagerImpl } from '@main/services/hostAdapters/chat'
import { AppConfigStore, ChatModelContextResolver } from '@main/services/hostAdapters/chat'
import { SystemPromptComposer } from '@main/services/hostAdapters/chat/preparation/request/SystemPromptComposer'
import { embeddedToolsRegistry } from '@tools/registry'
import { resolveAllowedEmbeddedToolsForAgent } from '@tools/permissions'
import type { ResolvedAgentApprovalPolicy } from '@tools/approval'
import { subagentRuntimeBridge } from './subagent-runtime-bridge'
import { processWorkContextGet } from '@main/tools/workContext/WorkContextToolsProcessor'
import { processActivityJournalList } from '@main/tools/activityJournal/ActivityJournalToolsProcessor'
import type { BuiltInSubagentRole, SubagentArtifacts } from '@tools/subagent/index.d'
import type { SubagentExecutionResult, SubagentSpawnInput } from './types'

const ROLE_PROMPTS: Record<BuiltInSubagentRole, string> = {
  general: 'Act as a focused subagent. Execute the assigned task and return a concise, useful summary.',
  researcher: 'Act as a research-oriented subagent. Prioritize finding relevant facts, code locations, and concrete evidence.',
  coder: 'Act as a coding subagent. Prefer concrete implementation progress and precise file-level outcomes.',
  reviewer: 'Act as a review subagent. Prioritize bugs, risks, behavioral regressions, and missing coverage.'
}

const SUBAGENT_APPROVAL_POLICY: ResolvedAgentApprovalPolicy = {
  mode: 'relaxed'
}

class SubagentEventCollector implements AgentStepEventListener {
  readonly toolsUsed = new Set<string>()
  readonly filesTouched = new Set<string>()

  handlePhaseChange(_phase: 'receiving' | 'toolCall'): void {}

  handleToolCallsDetected(toolCalls: import('@main/services/agentCore/types').ToolCall[]): void {
    toolCalls.forEach(tool => this.toolsUsed.add(tool.name))
  }

  handleToolExecutionProgress(progress: ToolExecutionProgress): void {
    this.toolsUsed.add(progress.name)
    const resultContent = progress.result?.content
    if (progress.name === 'write' || progress.name === 'edit') {
      const filePath = typeof resultContent?.file_path === 'string' ? resultContent.file_path : undefined
      if (filePath) {
        this.filesTouched.add(filePath)
      }
    }
  }
  buildArtifacts(): SubagentArtifacts {
    return {
      tools_used: Array.from(this.toolsUsed),
      files_touched: Array.from(this.filesTouched)
    }
  }
}

class InMemoryConversationStore implements ConversationStore {
  persistToolResultMessage(
    toolMsg: ChatMessage,
    chatId?: number,
    chatUuid?: string
  ): MessageEntity {
    return {
      chatId,
      chatUuid,
      body: toolMsg
    }
  }
}

const denyConfirmationRequester: ToolConfirmationRequester = {
  async request() {
    return {
      approved: false,
      reason: 'Subagent confirmation flow is not enabled in phase one.'
    }
  }
}

const noopMessageEventSink: AgentMessageEventSink = {
  emitMessageUpdated() {},
  emitToolResultAttached() {}
}

export class SubagentRuntimeFactory {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly modelContextResolver = new ChatModelContextResolver(),
    private readonly systemPromptComposer = new SystemPromptComposer(),
    private readonly stepRuntimeFactory = new AgentStepRuntimeFactory(),
    private readonly kernel = new AgentRunKernel()
  ) {}

  async run(input: SubagentSpawnInput): Promise<SubagentExecutionResult> {
    const config = this.appConfigStore.requireConfig()
    const modelContext = this.modelContextResolver.resolveOrThrow(config, input.modelRef)
    const chat = input.chatUuid ? DatabaseService.getChatByUuid(input.chatUuid) : undefined
    const workspacePath = input.chatUuid
      ? (DatabaseService.getWorkspacePathByUuid(input.chatUuid) || chat?.workspacePath || process.cwd())
      : process.cwd()

    const composedSystemPrompts = await this.systemPromptComposer.compose(
      workspacePath,
      chat?.id,
      undefined
    )

    const systemPrompt = [
      ...composedSystemPrompts,
      [
        '<subagent_mode>',
        'You are running as a background subagent for the main agent.',
        'Focus only on the assigned task and do not chat conversationally.',
        ROLE_PROMPTS[input.role as BuiltInSubagentRole] || `Act as a ${input.role} subagent. Execute the assigned task and return a concise, useful summary.`,
        'Use only the tools you are given.',
        'When you finish, return a concise summary with the key outcome, findings, and files touched when relevant.',
        '</subagent_mode>'
      ].join('\n')
    ].join('\n\n')

    const userMessage = await this.buildUserTaskMessage(input)
    const allowedTools = resolveAllowedEmbeddedToolsForAgent({
      kind: 'subagent',
      role: input.role
    }) || []
    const request = this.buildRequest(modelContext, systemPrompt, userMessage, allowedTools)
    const messageEntities = this.createMessageEntities(userMessage, modelContext, input.chatUuid)
    const eventCollector = new SubagentEventCollector()
    const signalController = new AbortController()

    const confirmationRequester: ToolConfirmationRequester = input.parentSubmissionId
      ? {
          request: (request) => subagentRuntimeBridge.request(input.parentSubmissionId!, request)
        }
      : denyConfirmationRequester
    const toolExecutor = new ToolExecutor({
      signal: signalController.signal,
      chatUuid: input.chatUuid,
      modelRef: input.modelRef,
      allowedTools,
      approvalPolicy: SUBAGENT_APPROVAL_POLICY,
      confirmationSource: {
        kind: 'subagent',
        subagentId: input.subagentId,
        role: input.role,
        task: input.task
      },
      requestConfirmation: (request) => confirmationRequester.request(request)
    })
    const messageManager = new AssistantStepMessageManagerImpl(
      messageEntities,
      request,
      noopMessageEventSink,
      undefined,
      input.chatUuid,
      new InMemoryConversationStore()
    )

    const runSpec: RunSpec = {
      submissionId: `subagent:${Date.now()}`,
      modelContext,
      request,
      initialMessages: [messageEntities[0].body],
      runtimeContext: {
        chatUuid: input.chatUuid,
        workspacePath
      }
    }

    const loop = this.stepRuntimeFactory.create({
      runSpec,
      signal: signalController.signal,
      parser: new ChunkParser(),
      messageManager,
      eventListener: eventCollector,
      toolExecutor,
      toolConfirmationRequester: confirmationRequester
    })

    const kernelResult = await this.kernel.run(() => loop.execute())

    if (kernelResult.state === 'failed') {
      throw new Error(kernelResult.error.message || 'Subagent run failed')
    }

    if (kernelResult.state === 'aborted') {
      throw new Error('Subagent run aborted')
    }

    const finalAssistant = messageManager.getLastAssistantMessage().body
    const summary = extractContentFromSegments(finalAssistant.segments)
      || (typeof finalAssistant.content === 'string' ? finalAssistant.content : '')

    return {
      summary: summary.trim(),
      artifacts: eventCollector.buildArtifacts()
    }
  }

  private buildRequest(
    modelContext: RunSpec['modelContext'],
    systemPrompt: string,
    userMessage: string,
    allowedTools: string[]
  ): IUnifiedRequest {
    return {
      adapterPluginId: modelContext.providerDefinition.adapterPluginId,
      baseUrl: modelContext.account.apiUrl,
      apiKey: modelContext.account.apiKey,
      model: modelContext.model.id,
      modelType: modelContext.model.type,
      requestOverrides: modelContext.providerDefinition.requestOverrides,
      stream: true,
      systemPrompt,
      messages: [{
        role: 'user',
        content: userMessage,
        segments: []
      }],
      tools: this.buildAllowedTools(allowedTools)
    }
  }

  private createMessageEntities(
    userMessage: string,
    modelContext: RunSpec['modelContext'],
    chatUuid?: string
  ): MessageEntity[] {
    const now = Date.now()
    return [
      {
        chatUuid,
        body: {
          createdAt: now,
          role: 'user',
          content: userMessage,
          segments: []
        }
      },
      {
        chatUuid,
        body: {
          createdAt: now,
          role: 'assistant',
          content: '',
          model: modelContext.model.label,
          modelRef: {
            accountId: modelContext.account.id,
            modelId: modelContext.model.id
          },
          segments: []
        }
      }
    ]
  }

  private buildAllowedTools(allowedToolNames: string[]): Array<{ name: string; description: string; parameters: any }> {
    return allowedToolNames
      .map((toolName) => embeddedToolsRegistry.getTool(toolName))
      .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool))
      .map((tool) => ({ ...tool.function }))
  }

  private async buildUserTaskMessage(input: SubagentSpawnInput): Promise<string> {
    const sections: string[] = [
      '# Subagent Task',
      input.task.trim()
    ]

    if (input.files.length > 0) {
      sections.push(
        '# File Hints',
        input.files.map(file => `- ${file}`).join('\n')
      )
    }

    if (input.contextMode === 'current_chat_summary' && input.chatUuid) {
      const recentSummary = this.buildRecentChatSummary(input.chatUuid)
      if (recentSummary) {
        sections.push('# Recent Chat Context', recentSummary)
      }

      const workContext = await processWorkContextGet({ chat_uuid: input.chatUuid })
      if (workContext.success && workContext.content?.trim()) {
        sections.push('# Work Context', workContext.content.trim())
      }

      const activityJournal = await processActivityJournalList({
        scope: 'current_chat',
        chat_uuid: input.chatUuid,
        limit: 5
      })
      if (activityJournal.success && activityJournal.entries.length > 0) {
        sections.push(
          '# Recent Activity Journal',
          activityJournal.entries
            .map(entry => `- ${entry.title}${entry.details ? `: ${entry.details}` : ''}`)
            .join('\n')
        )
      }
    }

    sections.push(
      '# Output Requirement',
      'Return a concise summary of what you found or changed. Include key findings and files touched when relevant.'
    )

    return sections.join('\n\n')
  }

  private buildRecentChatSummary(chatUuid: string): string {
    const messages = DatabaseService.getMessagesByChatUuid(chatUuid).slice(-8)
    if (messages.length === 0) {
      return ''
    }

    return messages
      .map((message) => {
        const content = this.extractMessageContent(message.body).slice(0, 400)
        if (!content) {
          return ''
        }
        return `- ${message.body.role}: ${content}`
      })
      .filter(Boolean)
      .join('\n')
  }

  private extractMessageContent(message: ChatMessage): string {
    if (typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim()
    }

    const fromSegments = extractContentFromSegments(message.segments)
    if (fromSegments.trim()) {
      return fromSegments.trim()
    }

    return ''
  }
}
