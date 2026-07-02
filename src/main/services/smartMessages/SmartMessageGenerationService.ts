import { createHash, randomUUID } from 'node:crypto'
import DatabaseService from '@main/db/DatabaseService'
import type { SmartMessageCandidateSummaryRow } from '@main/db/dao/SmartMessageDao'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { createLogger } from '@main/logging/LogService'
import { agent, type AgentToolCallResult } from '@main/agent'
import { SMART_MESSAGE_TTL_MS } from '@shared/constants/smartMessages'
import { resolveRequestOverrides } from '@main/request/overrides'
import { buildSmartMessagePrompt } from '@shared/prompts'
import { resolveLiteModelRef } from '@shared/services/ChatModelResolver'
import {
  GENERATE_SMART_MESSAGES_TOOL_NAME,
  generateSmartMessagesTool
} from '@shared/tools/smartMessages/definitions'

type SmartMessageDraft = {
  title: string
  body: string
  actionPrompt: string
  reason?: string
  priorityScore: number
}

type SmartMessageCandidateGroup = {
  chatId: number
  chatUuid: string
  chatTitle: string
  chatUpdateTime: number
  chatMsgCount: number
  summaries: SmartMessageCandidateSummaryRow[]
  sourceHash: string
  priorityScore: number
}

class SmartMessageDraftParseError extends Error {
  readonly finishReason?: IUnifiedResponse['finishReason']
  readonly contentPreview: string
  readonly toolCallNames: string[]

  constructor(message: string, response: {
    finishReason?: IUnifiedResponse['finishReason']
    content?: string
    toolCalls?: IToolCall[]
  }) {
    super(message)
    this.name = 'SmartMessageDraftParseError'
    this.finishReason = response.finishReason
    this.contentPreview = (response.content ?? '').slice(0, 240)
    this.toolCallNames = (response.toolCalls ?? []).map(call => call.function.name).filter(Boolean)
  }
}

type GenerateOptions = {
  now?: number
  lookbackMs?: number
  candidateLimit?: number
  maxMessages?: number
  generationVersion?: number
}

const DEFAULT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000
const DEFAULT_CANDIDATE_LIMIT = 40
const DEFAULT_MAX_MESSAGES = 3
const DEFAULT_GENERATION_VERSION = 1
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SMART_MESSAGE_SYSTEM_PROMPT = 'You are a smart-message generator. Return a structured smart-messages tool call with at most one best draft.'

const toUnifiedResponseLikeForParseError = (
  result: {
    content?: string
    error?: string
    toolCalls?: Array<{ name: string; args: Record<string, any> }>
  },
  finishReason?: IUnifiedResponse['finishReason']
) => ({
  content: result.content ?? result.error,
  finishReason,
    toolCalls: (result.toolCalls ?? []).map((toolCall, index) => ({
    id: `agent-tool-call-${index}`,
    type: 'function' as const,
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.args ?? {})
    }
  }))
})

export class SmartMessageGenerationService {
  private readonly logger = createLogger('SmartMessageGenerationService')
  private readonly modelContextResolver = new ChatModelContextResolver()
  private isGenerating = false

  async generate(options: GenerateOptions = {}): Promise<SmartMessageGenerationResult> {
    if (this.isGenerating) {
      return { generated: 0, skipped: 1 }
    }

    this.isGenerating = true
    try {
      const now = options.now ?? Date.now()
      const generationVersion = options.generationVersion ?? DEFAULT_GENERATION_VERSION
      const groups = this.buildCandidateGroups({
        now,
        lookbackMs: options.lookbackMs ?? DEFAULT_LOOKBACK_MS,
        candidateLimit: options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT,
        generationVersion
      })

      if (groups.length === 0) {
        return { generated: 0, skipped: 0 }
      }

      const modelContext = this.resolveModelContext()
      if (!modelContext) {
        this.logger.warn('generate.skipped.no_model')
        return { generated: 0, skipped: groups.length, error: 'No model context resolved' }
      }

      let generated = 0
      let skipped = 0
      const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES
      for (const group of groups.slice(0, maxMessages)) {
        try {
          const existing = DatabaseService.getSmartMessageBySourceHash(
            group.sourceHash,
            generationVersion
          )
          if (existing) {
            skipped += 1
            continue
          }

          const draft = await this.generateDraft(group, modelContext)
          DatabaseService.markChatSmartMessagesStale(group.chatUuid)
          DatabaseService.upsertSmartMessage(this.toSmartMessageEntity({
            draft,
            group,
            now,
            generationVersion,
            modelId: modelContext.model.id
          }))
          generated += 1
        } catch (error) {
          skipped += 1
          this.logger.warn('generate.group_failed', this.buildGroupFailureContext(group, error))
        }
      }

      this.logger.info('generate.completed', { generated, skipped })
      return { generated, skipped }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('generate.failed', { error: message })
      return { generated: 0, skipped: 0, error: message }
    } finally {
      this.isGenerating = false
    }
  }

  buildCandidateGroups(options: {
    now: number
    lookbackMs: number
    candidateLimit: number
    generationVersion: number
  }): SmartMessageCandidateGroup[] {
    const rows = DatabaseService.listRecentSmartMessageCandidateSummaries(
      options.now - options.lookbackMs,
      options.candidateLimit
    )
    const byChatUuid = new Map<string, SmartMessageCandidateSummaryRow[]>()

    for (const row of rows) {
      const list = byChatUuid.get(row.chat_uuid) ?? []
      if (list.length < 3) {
        list.push(row)
      }
      byChatUuid.set(row.chat_uuid, list)
    }

    return Array.from(byChatUuid.values())
      .map(summaries => {
        const first = summaries[0]
        const chatUpdateAge = Math.max(0, options.now - first.chat_update_time)
        const recencyScore = Math.max(0, 1 - chatUpdateAge / ONE_WEEK_MS)
        const coverageScore = Math.min(1, first.chat_msg_count / 80)
        const priorityScore = Number((recencyScore * 0.75 + coverageScore * 0.25).toFixed(4))

        return {
          chatId: first.chat_id,
          chatUuid: first.chat_uuid,
          chatTitle: first.chat_title,
          chatUpdateTime: first.chat_update_time,
          chatMsgCount: first.chat_msg_count,
          summaries,
          sourceHash: this.createSourceHash(summaries, options.generationVersion),
          priorityScore
        }
      })
      .sort((left, right) => right.priorityScore - left.priorityScore)
  }

  parseToolDrafts(toolCalls: AgentToolCallResult[] | undefined): SmartMessageDraft[] {
    const toolCall = toolCalls?.find(call => call.name === GENERATE_SMART_MESSAGES_TOOL_NAME)
    if (!toolCall) {
      throw new Error('generate_smart_messages tool call missing')
    }

    const parsed = toolCall.args
    const items = Array.isArray(parsed)
      ? parsed
      : this.extractDraftArrayFromObject(parsed)

    if (items.length === 0) {
      throw new Error('generate_smart_messages arguments are empty')
    }

    return items.map(item => this.normalizeDraft(item))
  }

  private async generateDraft(
    group: SmartMessageCandidateGroup,
    modelContext: {
      model: AccountModel
      account: ProviderAccount
      providerDefinition: ProviderDefinition
    }
  ): Promise<SmartMessageDraft> {
    const content = buildSmartMessagePrompt({
      summaries: group.summaries.map(summary => ({
        chatTitle: group.chatTitle,
        summary: summary.summary,
        compressedAt: summary.compressed_at,
        chatUpdatedAt: group.chatUpdateTime
      }))
    })

    const response = await agent(
      'smart-message-generator',
      SMART_MESSAGE_SYSTEM_PROMPT,
      [GENERATE_SMART_MESSAGES_TOOL_NAME],
      [{
        role: 'user',
        content
      }],
      false,
      {
        model: modelContext.model,
        account: modelContext.account,
        providerDefinition: modelContext.providerDefinition,
        toolDefinitions: [generateSmartMessagesTool],
        sanitizeOverrides: providerOverrides => resolveRequestOverrides(providerOverrides, 'smartMessage')
      }
    )
    let drafts: SmartMessageDraft[]
    try {
      if (response.type === 'text' || response.type === 'error') {
        throw new Error(
          response.type === 'error'
            ? `smart-message-generator failed: ${response.error ?? 'tool call failed'}`
            : 'smart-message-generator returned text response'
        )
      }

      drafts = this.parseToolDrafts(response.toolCalls)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const finishReason = response.type === 'error' ? 'error' : undefined
      throw new SmartMessageDraftParseError(
        message,
        toUnifiedResponseLikeForParseError(response, finishReason)
      )
    }
    return drafts[0]
  }

  private toSmartMessageEntity(args: {
    draft: SmartMessageDraft
    group: SmartMessageCandidateGroup
    now: number
    generationVersion: number
    modelId: string
  }): SmartMessageEntity {
    const priorityScore = args.draft.priorityScore
    return {
      id: randomUUID(),
      chatId: args.group.chatId,
      chatUuid: args.group.chatUuid,
      sourceSummaryIds: args.group.summaries.map(summary => summary.id),
      sourceHash: args.group.sourceHash,
      title: args.draft.title,
      body: args.draft.body,
      actionPrompt: args.draft.actionPrompt,
      reason: args.draft.reason,
      priorityScore,
      status: 'active',
      generatedAt: args.now,
      expiresAt: args.now + SMART_MESSAGE_TTL_MS,
      modelId: args.modelId,
      generationVersion: args.generationVersion
    }
  }

  private createSourceHash(
    summaries: SmartMessageCandidateSummaryRow[],
    generationVersion: number
  ): string {
    const hash = createHash('sha256')
    hash.update(String(generationVersion))
    for (const summary of summaries) {
      hash.update('|')
      hash.update(String(summary.id))
      hash.update(':')
      hash.update(String(summary.end_message_id))
      hash.update(':')
      hash.update(String(summary.compressed_at))
    }
    return hash.digest('hex')
  }

  private resolveModelContext() {
    const config = DatabaseService.getConfig()
    if (!config) return null
    const modelRef = resolveLiteModelRef(config)
    if (!modelRef) return null
    return this.modelContextResolver.resolve(config, modelRef)
  }

  private buildGroupFailureContext(
    group: SmartMessageCandidateGroup,
    error: unknown
  ): Record<string, unknown> {
    const message = error instanceof Error ? error.message : String(error)
    const context: Record<string, unknown> = {
      chatUuid: group.chatUuid,
      error: message
    }

    if (error instanceof SmartMessageDraftParseError) {
      context.finishReason = error.finishReason
      context.contentPreview = error.contentPreview
      context.toolCallNames = error.toolCallNames
    }

    return context
  }

  private cleanString(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return ''
    const trimmed = value.trim().replace(/\s+/g, ' ')
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength).trim() : trimmed
  }

  private extractDraftArrayFromObject(parsed: unknown): unknown[] {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('generate_smart_messages arguments must include a messages array')
    }

    const value = parsed as Record<string, unknown>
    if (Array.isArray(value.messages)) return value.messages
    if (Array.isArray(value.smartMessages)) return value.smartMessages
    if (Array.isArray(value.items)) return value.items

    throw new Error('generate_smart_messages arguments must include a messages array')
  }

  private normalizeDraft(value: unknown): SmartMessageDraft {
    if (!value || typeof value !== 'object') {
      throw new Error('Smart message draft must be an object')
    }

    const record = value as Record<string, unknown>
    const title = this.cleanString(record.title, 60)
    const body = this.cleanString(record.body, 180)
    const actionPrompt = this.cleanString(record.actionPrompt, 300)
    const reason = this.cleanString(record.reason, 180)
    const rawPriorityScore = record.priorityScore
    const priorityScore = typeof rawPriorityScore === 'number' && Number.isFinite(rawPriorityScore)
      ? Math.max(0, Math.min(1, rawPriorityScore))
      : undefined

    if (!title || !body || !actionPrompt || priorityScore === undefined) {
      throw new Error('Smart message draft missing required fields')
    }

    return {
      title,
      body,
      actionPrompt,
      reason: reason || undefined,
      priorityScore
    }
  }
}

export const smartMessageGenerationService = new SmartMessageGenerationService()
