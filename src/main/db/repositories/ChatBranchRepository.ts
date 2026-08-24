import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ChatDao, ChatRow } from '../dao/ChatDao'
import type { CompressedSummaryDao, CompressedSummaryRow } from '../dao/CompressedSummaryDao'
import type { MessageDao, MessageRow } from '../dao/MessageDao'
import type { MessageSearchDao } from '../dao/MessageSearchDao'
import type { SkillDao } from '../dao/SkillDao'
import type { ToolResultCompactionDao, ToolResultCompactionRow } from '../dao/ToolResultCompactionDao'
import type { WorkContextDao } from '../dao/WorkContextDao'
import { toChatEntity, toChatRow } from '../mappers/ChatMapper'
import { toMessageEntity } from '../mappers/MessageMapper'

export type ChatForkErrorCode =
  | 'INVALID_REQUEST'
  | 'CHAT_NOT_FOUND'
  | 'CHAT_IDENTITY_MISMATCH'
  | 'MESSAGE_NOT_FOUND'
  | 'INVALID_FORK_BOUNDARY'

export class ChatForkError extends Error {
  constructor(
    public readonly code: ChatForkErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ChatForkError'
  }
}

type Deps = {
  db: Database.Database
  chatDao: ChatDao
  messageDao: MessageDao
  messageSearchDao: MessageSearchDao
  skillDao: SkillDao
  workContextDao: WorkContextDao
  compressedSummaryDao: CompressedSummaryDao
  toolResultCompactionDao: ToolResultCompactionDao
  now?: () => number
  uuid?: () => string
}

export class ChatBranchRepository {
  private readonly now: () => number
  private readonly uuid: () => string

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? Date.now
    this.uuid = deps.uuid ?? randomUUID
  }

  forkChat(request: ChatForkRequest): ChatForkResult {
    validateForkRequest(request)
    const transaction = this.deps.db.transaction(
      (input: ChatForkRequest) => this.forkInTransaction(input)
    )
    return transaction.immediate(request)
  }

  private forkInTransaction(request: ChatForkRequest): ChatForkResult {
    const sourceChat = this.deps.chatDao.getChatById(request.sourceChatId)
    if (!sourceChat) {
      throw new ChatForkError('CHAT_NOT_FOUND', `Source chat not found: ${request.sourceChatId}`)
    }
    if (sourceChat.uuid !== request.sourceChatUuid) {
      throw new ChatForkError('CHAT_IDENTITY_MISMATCH', 'Source chat id and uuid do not match')
    }

    const sourceMessages = this.deps.messageDao.getMessagesByChatUuid(sourceChat.uuid)
    const boundaryIndex = sourceMessages.findIndex(row => row.id === request.forkedFromMessageId)
    if (boundaryIndex < 0) {
      throw new ChatForkError('MESSAGE_NOT_FOUND', 'Fork boundary message does not belong to the source chat')
    }

    const boundaryBody = parseMessageBody(sourceMessages[boundaryIndex])
    if (
      boundaryBody.role !== 'assistant'
      || boundaryBody.typewriterCompleted === false
    ) {
      throw new ChatForkError(
        'INVALID_FORK_BOUNDARY',
        'Fork boundary must be a completed assistant message'
      )
    }

    const prefix = sourceMessages.slice(0, boundaryIndex + 1)
    const prefixIds = new Set(prefix.map(row => row.id))
    const summary = selectCompatibleSummary(
      this.deps.compressedSummaryDao.getByChatId(sourceChat.id),
      prefixIds
    )
    const summarySourceIds = new Set(summary ? parseSummaryMessageIds(summary) : [])
    const readyCompactions = groupReadyCompactions(
      this.deps.toolResultCompactionDao.getReadyByMessageIds(
        prefix.filter(row => parseMessageBody(row).role === 'tool').map(row => row.id)
      )
    )

    const forkedAt = this.now()
    const destinationUuid = this.uuid()
    const destinationTitle = createForkTitle(sourceChat, this.deps.chatDao.getAllChats())
    const targetModelRef = boundaryBody.modelRef ?? (
      sourceChat.model_account_id && sourceChat.model_model_id
        ? { accountId: sourceChat.model_account_id, modelId: sourceChat.model_model_id }
        : undefined
    )
    const destination: ChatEntity = {
      uuid: destinationUuid,
      title: destinationTitle,
      messages: [],
      msgCount: 0,
      modelRef: targetModelRef,
      workspacePath: sourceChat.workspace_path ?? undefined,
      userInstruction: sourceChat.user_instruction ?? undefined,
      permissionApprovalMode: sourceChat.permission_approval_mode ?? undefined,
      parentChatUuid: sourceChat.uuid,
      forkedFromMessageId: request.forkedFromMessageId,
      forkedAt,
      createTime: forkedAt,
      updateTime: forkedAt
    }
    const destinationId = this.deps.chatDao.insertChat(toChatRow(destination, forkedAt))
    destination.id = destinationId

    const copiedMessages: MessageEntity[] = []
    const destinationSummaryIds: number[] = []
    let countedMessages = 0

    for (const sourceRow of prefix) {
      const body = parseMessageBody(sourceRow)
      const destinationRow: Omit<MessageRow, 'id'> = {
        chat_id: destinationId,
        chat_uuid: destinationUuid,
        body: sourceRow.id === request.forkedFromMessageId && body.toolCalls?.length
          ? serializeForkBoundaryBody(body)
          : sourceRow.body,
        tokens: sourceRow.tokens,
        token_usage: sourceRow.token_usage
      }
      const destinationMessageId = this.deps.messageDao.insertMessage(destinationRow)
      const insertedRow: MessageRow = { id: destinationMessageId, ...destinationRow }
      this.deps.messageSearchDao.syncMessage(insertedRow)

      if (body.role === 'user' || body.role === 'assistant') {
        countedMessages += 1
      }
      if (summarySourceIds.has(sourceRow.id)) {
        destinationSummaryIds.push(destinationMessageId)
      }
      for (const compaction of readyCompactions.get(sourceRow.id) ?? []) {
        if (matchesRawToolContent(body.content, compaction.original_hash)) {
          this.copyReadyCompaction(compaction, destinationMessageId, forkedAt)
        }
      }

      copiedMessages.push(toMessageEntity(insertedRow))
      destination.messages.push(destinationMessageId)
    }

    if (countedMessages > 0) {
      this.deps.chatDao.updateMessageCount(destinationId, countedMessages)
      destination.msgCount = countedMessages
    }

    if (summary && destinationSummaryIds.length === summarySourceIds.size && destinationSummaryIds.length > 0) {
      this.deps.compressedSummaryDao.insert({
        chat_id: destinationId,
        chat_uuid: destinationUuid,
        message_ids: JSON.stringify(destinationSummaryIds),
        start_message_id: destinationSummaryIds[0],
        end_message_id: destinationSummaryIds[destinationSummaryIds.length - 1],
        summary: summary.summary,
        original_token_count: summary.original_token_count,
        summary_token_count: summary.summary_token_count,
        used_token_count_at_compression: summary.used_token_count_at_compression,
        compression_ratio: summary.compression_ratio,
        compressed_at: summary.compressed_at,
        compression_model: summary.compression_model,
        compression_version: summary.compression_version,
        status: 'active'
      })
    }

    for (const skill of this.deps.skillDao.getSkills(sourceChat.id)) {
      this.deps.skillDao.insertSkill({
        chat_id: destinationId,
        skill_name: skill.skill_name,
        load_order: skill.load_order,
        loaded_at: skill.loaded_at
      })
    }

    const workContext = this.deps.workContextDao.getByChatId(sourceChat.id)
    if (workContext) {
      this.deps.workContextDao.upsert({
        chat_id: destinationId,
        chat_uuid: destinationUuid,
        content: workContext.content,
        created_at: forkedAt,
        updated_at: forkedAt
      })
    }

    const storedChat = this.deps.chatDao.getChatById(destinationId)
    if (!storedChat) {
      throw new Error('Forked chat could not be read after insertion')
    }

    return {
      chat: {
        ...toChatEntity(storedChat),
        messages: destination.messages
      },
      messages: copiedMessages
    }
  }

  private copyReadyCompaction(
    source: ToolResultCompactionRow,
    destinationMessageId: number,
    forkedAt: number
  ): void {
    this.deps.toolResultCompactionDao.insertReadySnapshot({
      ...source,
      message_id: destinationMessageId,
      created_at: forkedAt,
      updated_at: forkedAt,
      last_error_code: null
    })
  }
}

function validateForkRequest(request: ChatForkRequest): void {
  if (
    !request
    || !Number.isInteger(request.sourceChatId)
    || request.sourceChatId <= 0
    || typeof request.sourceChatUuid !== 'string'
    || request.sourceChatUuid.trim().length === 0
    || !Number.isInteger(request.forkedFromMessageId)
    || request.forkedFromMessageId <= 0
  ) {
    throw new ChatForkError('INVALID_REQUEST', 'Chat fork request is invalid')
  }
}

function parseMessageBody(row: MessageRow): ChatMessage {
  try {
    return JSON.parse(row.body) as ChatMessage
  } catch {
    throw new ChatForkError('INVALID_FORK_BOUNDARY', `Message ${row.id} contains invalid JSON`)
  }
}

function serializeForkBoundaryBody(body: ChatMessage): string {
  const normalizedBody = { ...body }
  delete normalizedBody.toolCalls
  return JSON.stringify(normalizedBody)
}

function createForkTitle(sourceChat: ChatRow, chats: ChatRow[]): string {
  const chatsByUuid = new Map(chats.map(chat => [chat.uuid, chat]))
  const root = resolveLineageRoot(sourceChat, chatsByUuid)
  const baseTitle = root.title
  const numberedTitle = new RegExp(`^${escapeRegExp(baseTitle)} \\((\\d+)\\)$`)
  let maximumNumber = 0

  for (const chat of chats) {
    if (!belongsToLineage(chat, root.uuid, chatsByUuid)) {
      continue
    }
    const match = numberedTitle.exec(chat.title)
    if (match) {
      const candidateNumber = Number(match[1])
      if (Number.isSafeInteger(candidateNumber)) {
        maximumNumber = Math.max(maximumNumber, candidateNumber)
      }
    }
  }

  return `${baseTitle} (${maximumNumber + 1})`
}

function resolveLineageRoot(sourceChat: ChatRow, chatsByUuid: Map<string, ChatRow>): ChatRow {
  const visited = new Set<string>()
  let current = sourceChat

  while (current.parent_chat_uuid) {
    if (visited.has(current.uuid)) {
      return sourceChat
    }
    visited.add(current.uuid)
    const parent = chatsByUuid.get(current.parent_chat_uuid)
    if (!parent) {
      return sourceChat
    }
    current = parent
  }

  return current
}

function belongsToLineage(
  chat: ChatRow,
  rootUuid: string,
  chatsByUuid: Map<string, ChatRow>
): boolean {
  const visited = new Set<string>()
  let current: ChatRow | undefined = chat

  while (current) {
    if (current.uuid === rootUuid) {
      return true
    }
    if (!current.parent_chat_uuid || visited.has(current.uuid)) {
      return false
    }
    visited.add(current.uuid)
    current = chatsByUuid.get(current.parent_chat_uuid)
  }

  return false
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseSummaryMessageIds(summary: CompressedSummaryRow): number[] {
  try {
    const ids = JSON.parse(summary.message_ids) as unknown
    return Array.isArray(ids) && ids.every(id => Number.isInteger(id)) ? ids as number[] : []
  } catch {
    return []
  }
}

function selectCompatibleSummary(
  summaries: CompressedSummaryRow[],
  prefixIds: Set<number>
): CompressedSummaryRow | undefined {
  return summaries
    .map(summary => ({ summary, messageIds: parseSummaryMessageIds(summary) }))
    .filter(candidate => (
      candidate.summary.status !== 'invalid'
      && candidate.messageIds.length > 0
      && candidate.messageIds.every(messageId => prefixIds.has(messageId))
    ))
    .sort((left, right) => (
      right.messageIds.length - left.messageIds.length
      || right.summary.compressed_at - left.summary.compressed_at
      || right.summary.id - left.summary.id
    ))[0]?.summary
}

function matchesRawToolContent(content: ChatMessage['content'], originalHash: string): boolean {
  return typeof content === 'string'
    && createHash('sha256').update(content).digest('hex') === originalHash
}

function groupReadyCompactions(
  rows: ToolResultCompactionRow[]
): Map<number, ToolResultCompactionRow[]> {
  const grouped = new Map<number, ToolResultCompactionRow[]>()
  for (const row of rows) {
    const bucket = grouped.get(row.message_id) ?? []
    bucket.push(row)
    grouped.set(row.message_id, bucket)
  }
  return grouped
}
