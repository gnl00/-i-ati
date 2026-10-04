import { chatDb } from '@main/db/chat'
import { extractContentFromSegments } from '@main/services/messages/MessageSegmentContent'
import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { buildSubagentSystemPrompt } from '@shared/prompts/subagent'
import { WORK_CONTEXT_TEMPLATE } from '@main/services/workContext/WorkContextService'
import { resolveAllowedEmbeddedToolsForAgent } from '@tools/permissions'
import type { SubagentExecutionResult, SubagentSpawnInput } from './types'
import {
  DefaultSubagentRuntimeRunner,
  type PreparedSubagentRunContext,
  type SubagentRuntimeRunner
} from './runtime/SubagentRuntimeRunner'
import { DefaultSubagentContextReader, type SubagentContextReader } from './SubagentContextReader'

export class SubagentRuntimeFactory {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly modelContextResolver = new ChatModelContextResolver(),
    private readonly runtimeRunner: SubagentRuntimeRunner = new DefaultSubagentRuntimeRunner(),
    private readonly contextReader: SubagentContextReader = new DefaultSubagentContextReader()
  ) {}

  async run(input: SubagentSpawnInput): Promise<SubagentExecutionResult> {
    const config = this.appConfigStore.requireConfig()
    const modelContext = this.modelContextResolver.resolveOrThrow(config, input.modelRef)
    const chat = input.chatUuid ? chatDb.getChatByUuid(input.chatUuid) : undefined
    const workspacePath = input.chatUuid
      ? chatDb.getWorkspacePathByUuid(input.chatUuid) || chat?.workspacePath || process.cwd()
      : process.cwd()

    const systemPrompt = buildSubagentSystemPrompt(input.role)

    const userMessage = await this.buildUserTaskMessage(input)
    const allowedTools =
      resolveAllowedEmbeddedToolsForAgent({
        kind: 'subagent',
        role: input.role
      }) || []

    const preparedContext: PreparedSubagentRunContext = {
      modelContext,
      systemPrompt,
      userMessage,
      allowedTools,
      workspacePath
    }

    return this.runtimeRunner.run(input, preparedContext)
  }

  private async buildUserTaskMessage(input: SubagentSpawnInput): Promise<string> {
    const sections: string[] = ['# Subagent Task', input.task.trim()]

    if (input.files.length > 0) {
      sections.push('# File Hints', input.files.map((file) => `- ${file}`).join('\n'))
    }

    if (input.contextMode === 'current_chat_summary' && input.chatUuid) {
      const recentSummary = this.buildRecentChatSummary(input.chatUuid)
      if (recentSummary) {
        sections.push('# Recent Chat Context', recentSummary)
      }

      const workContext = this.safeReadWorkContext(input.chatUuid)
      sections.push('# Work Context', workContext.trim())

      const activityJournal = await this.safeListRecentActivity(input.chatUuid, 5)
      if (activityJournal.length > 0) {
        sections.push(
          '# Recent Activity Journal',
          activityJournal.map((entry) => `- ${entry.title}${entry.details ? `: ${entry.details}` : ''}`).join('\n')
        )
      }
    }

    sections.push(
      '# Output Requirement',
      'Return a concise summary of what you found or changed. Include key findings and files touched when relevant.'
    )

    return sections.join('\n\n')
  }

  private safeReadWorkContext(chatUuid: string): string {
    try {
      return this.contextReader.getWorkContext(chatUuid)?.trim() || WORK_CONTEXT_TEMPLATE
    } catch {
      return WORK_CONTEXT_TEMPLATE
    }
  }

  private async safeListRecentActivity(
    chatUuid: string,
    limit: number
  ): Promise<Awaited<ReturnType<SubagentContextReader['listRecentActivity']>>> {
    try {
      return await this.contextReader.listRecentActivity(chatUuid, limit)
    } catch {
      return []
    }
  }

  private buildRecentChatSummary(chatUuid: string): string {
    const messages = chatDb.getMessagesByChatUuid(chatUuid).slice(-8)
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
