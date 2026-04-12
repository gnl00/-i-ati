import DatabaseService from '@main/db/DatabaseService'
import { extractContentFromSegments } from '@main/services/messages/MessageSegmentContent'
import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { SystemPromptComposer } from '@main/hosts/chat/preparation/request/SystemPromptComposer'
import { resolveAllowedEmbeddedToolsForAgent } from '@tools/permissions'
import { processWorkContextGet } from '@main/tools/workContext/WorkContextToolsProcessor'
import { processActivityJournalList } from '@main/tools/activityJournal/ActivityJournalToolsProcessor'
import type { BuiltInSubagentRole } from '@tools/subagent/index.d'
import type { SubagentExecutionResult, SubagentSpawnInput } from './types'
import {
  DefaultSubagentRuntimeRunner,
  type PreparedSubagentRunContext,
  type SubagentRuntimeRunner
} from './runtime/SubagentRuntimeRunner'

const ROLE_PROMPTS: Record<BuiltInSubagentRole, string> = {
  general: 'Act as a focused subagent. Execute the assigned task and return a concise, useful summary.',
  researcher: 'Act as a research-oriented subagent. Prioritize finding relevant facts, code locations, and concrete evidence.',
  coder: 'Act as a coding subagent. Prefer concrete implementation progress and precise file-level outcomes.',
  reviewer: 'Act as a review subagent. Prioritize bugs, risks, behavioral regressions, and missing coverage.'
}

export class SubagentRuntimeFactory {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly modelContextResolver = new ChatModelContextResolver(),
    private readonly systemPromptComposer = new SystemPromptComposer(),
    private readonly runtimeRunner: SubagentRuntimeRunner = new DefaultSubagentRuntimeRunner()
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
