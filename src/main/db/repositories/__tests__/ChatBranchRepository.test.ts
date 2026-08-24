import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import type { ChatDao, ChatRow } from '../../dao/ChatDao'
import type { CompressedSummaryDao, CompressedSummaryRow } from '../../dao/CompressedSummaryDao'
import type { MessageDao, MessageRow } from '../../dao/MessageDao'
import type { MessageSearchDao } from '../../dao/MessageSearchDao'
import type { SkillDao, SkillRow } from '../../dao/SkillDao'
import type { ToolResultCompactionDao, ToolResultCompactionRow } from '../../dao/ToolResultCompactionDao'
import type { WorkContextDao, WorkContextRow } from '../../dao/WorkContextDao'
import { ChatBranchRepository, ChatForkError } from '../ChatBranchRepository'

type State = {
  chats: ChatRow[]
  messages: MessageRow[]
  skills: SkillRow[]
  workContexts: WorkContextRow[]
  summaries: CompressedSummaryRow[]
  compactions: ToolResultCompactionRow[]
  searchMessageIds: number[]
}

type Harness = {
  state: State
  repository: ChatBranchRepository
  transaction: ReturnType<typeof vi.fn>
  addMessage: (body: ChatMessage, chat?: { id: number; uuid: string }) => number
}

describe('ChatBranchRepository', () => {
  it('creates a physical prefix snapshot with chat context, skills, work context, and search rows', () => {
    const harness = createHarness()
    harness.state.skills.push(
      { chat_id: 1, skill_name: 'memory', load_order: 1, loaded_at: 100 },
      { chat_id: 1, skill_name: 'browser', load_order: 2, loaded_at: 200 }
    )
    harness.state.workContexts.push({
      chat_id: 1,
      chat_uuid: 'source-chat',
      content: 'branch context',
      created_at: 100,
      updated_at: 200
    })
    const userId = harness.addMessage(userMessage('hello', 100))
    const assistantId = harness.addMessage(assistantMessage('answer', 200, {
      accountId: 'assistant-account',
      modelId: 'assistant-model'
    }))
    harness.addMessage(userMessage('future', 300))

    const result = harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: assistantId
    })

    expect(result.chat).toMatchObject({
      id: 2,
      uuid: 'branch-chat',
      title: 'Source title (1)',
      msgCount: 2,
      modelRef: { accountId: 'assistant-account', modelId: 'assistant-model' },
      workspacePath: '/workspace/source',
      userInstruction: 'keep context',
      permissionApprovalMode: 'auto',
      parentChatUuid: 'source-chat',
      forkedFromMessageId: assistantId,
      forkedAt: 2_000
    })
    expect(result.messages.map(message => message.body.content)).toEqual(['hello', 'answer'])
    expect(result.messages.map(message => message.id)).not.toContain(userId)
    expect(result.messages.every(message => message.chatUuid === 'branch-chat')).toBe(true)
    expect(harness.state.skills.filter(row => row.chat_id === 2)).toMatchObject([
      { skill_name: 'memory', load_order: 1 },
      { skill_name: 'browser', load_order: 2 }
    ])
    expect(harness.state.workContexts.find(row => row.chat_id === 2)).toMatchObject({
      chat_uuid: 'branch-chat',
      content: 'branch context'
    })
    expect(harness.state.searchMessageIds).toEqual(result.messages.map(message => message.id))
    expect(harness.transaction).toHaveBeenCalledOnce()
  })

  it('stores the largest compatible summary and valid ready tool compactions with destination message ids', () => {
    const harness = createHarness()
    const userId = harness.addMessage(userMessage('question', 100))
    const toolCallId = 'call-1'
    const assistantToolId = harness.addMessage(assistantMessage('using tool', 200, undefined, [{
      id: toolCallId,
      type: 'function',
      function: { name: 'web_fetch', arguments: '{}' }
    }], false))
    const rawToolContent = 'raw tool result'
    const toolMessageId = harness.addMessage({
      role: 'tool',
      content: rawToolContent,
      toolCallId,
      name: 'web_fetch',
      segments: [],
      createdAt: 300
    })
    const boundaryId = harness.addMessage(assistantMessage('final answer', 400))
    const laterId = harness.addMessage(userMessage('later', 500))

    harness.state.summaries.push(
      summaryRow([userId], 'small', 100, 'superseded', 1),
      summaryRow(
        [userId, assistantToolId, toolMessageId],
        'largest compatible',
        200,
        'superseded',
        2
      ),
      summaryRow(
        [userId, assistantToolId, toolMessageId, boundaryId, laterId],
        'future summary',
        300,
        'active',
        3
      )
    )

    const originalHash = createHash('sha256').update(rawToolContent).digest('hex')
    harness.state.compactions.push(
      readyCompactionRow(toolMessageId, originalHash, toolCallId, 1),
      readyCompactionRow(toolMessageId, 'stale-hash', toolCallId, 2, 'minimal'),
      { ...readyCompactionRow(toolMessageId, originalHash, toolCallId, 3, 'minimal'), status: 'pending' }
    )

    const result = harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: boundaryId
    })

    const copiedSummary = harness.state.summaries.filter(row => row.chat_id === 2)
    expect(copiedSummary).toHaveLength(1)
    expect(copiedSummary[0].summary).toBe('largest compatible')
    const copiedSummaryIds = JSON.parse(copiedSummary[0].message_ids) as number[]
    expect(copiedSummaryIds).toEqual(result.messages.slice(0, 3).map(message => message.id))
    expect(copiedSummary[0].start_message_id).toBe(copiedSummaryIds[0])
    expect(copiedSummary[0].end_message_id).toBe(copiedSummaryIds[2])

    const copiedToolMessage = result.messages.find(message => message.body.role === 'tool')
    const copiedReady = harness.state.compactions.filter(row => row.message_id === copiedToolMessage!.id)
    expect(copiedReady).toHaveLength(1)
    expect(copiedReady[0]).toMatchObject({
      tool_call_id: toolCallId,
      original_hash: originalHash,
      content: 'compact result',
      status: 'ready',
      created_at: 2_000,
      updated_at: 2_000
    })
  })

  it('cuts strictly at the completed assistant boundary and normalizes its tool protocol', () => {
    const harness = createHarness()
    const userId = harness.addMessage(userMessage('question', 100))
    const toolCallId = 'call-boundary'
    const boundaryBody = assistantMessage('completed answer', 200, {
      accountId: 'boundary-account',
      modelId: 'boundary-model'
    }, [{
      id: toolCallId,
      type: 'function',
      function: { name: 'read_file', arguments: '{}' }
    }])
    boundaryBody.segments = [{
      type: 'toolCall',
      segmentId: 'tool-segment-1',
      name: 'read_file',
      content: { status: 'completed' },
      timestamp: 210,
      toolCallId
    }]
    const boundaryId = harness.addMessage(boundaryBody)
    const toolMessageId = harness.addMessage({
      role: 'tool',
      content: 'paired result',
      toolCallId,
      name: 'read_file',
      segments: [],
      createdAt: 300
    })
    harness.addMessage(userMessage('future', 400))
    harness.state.summaries.push(
      summaryRow([userId, boundaryId], 'strict prefix summary', 100, 'superseded', 1),
      summaryRow([userId, boundaryId, toolMessageId], 'summary past boundary', 200, 'active', 2)
    )
    const originalHash = createHash('sha256').update('paired result').digest('hex')
    harness.state.compactions.push(readyCompactionRow(toolMessageId, originalHash, toolCallId, 1))

    const result = harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: boundaryId
    })

    expect(result.messages.map(message => message.body.content)).toEqual(['question', 'completed answer'])
    expect(result.messages.at(-1)?.body).toMatchObject({
      role: 'assistant',
      content: 'completed answer',
      segments: boundaryBody.segments,
      typewriterCompleted: true,
      createdAt: 200,
      modelRef: boundaryBody.modelRef
    })
    expect(result.messages.at(-1)?.body.toolCalls).toBeUndefined()
    expect(result.messages.at(-1)).toMatchObject({
      tokens: 12,
      tokenUsage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 }
    })
    expect(harness.state.summaries.filter(row => row.chat_id === 2)).toMatchObject([
      { summary: 'strict prefix summary' }
    ])
    expect(harness.state.compactions.filter(row => row.message_id !== toolMessageId)).toEqual([])
  })

  it('rejects invalid identities and explicitly incomplete assistant boundaries before writing', () => {
    const harness = createHarness()
    const pendingBoundaryId = harness.addMessage(assistantMessage('pending', 100, undefined, [{
      id: 'call-pending',
      type: 'function',
      function: { name: 'read_file', arguments: '{}' }
    }], false))
    const originalChatCount = harness.state.chats.length

    expect(() => harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'wrong-chat',
      forkedFromMessageId: pendingBoundaryId
    })).toThrowError(ChatForkError)
    expect(() => harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: pendingBoundaryId
    })).toThrowError(ChatForkError)
    expect(harness.state.chats).toHaveLength(originalChatCount)
    expect(harness.state.messages.filter(row => row.chat_uuid === 'branch-chat')).toEqual([])
  })

  it('rejects malformed runtime requests before opening a transaction', () => {
    const harness = createHarness()

    expect(() => harness.repository.forkChat({
      sourceChatId: 0,
      sourceChatUuid: '',
      forkedFromMessageId: 0
    })).toThrowError(expect.objectContaining({ code: 'INVALID_REQUEST' }))
    expect(harness.transaction).not.toHaveBeenCalled()
  })

  it('returns typed errors for missing source chats and foreign message boundaries', () => {
    const harness = createHarness()

    expect(() => harness.repository.forkChat({
      sourceChatId: 99,
      sourceChatUuid: 'missing-chat',
      forkedFromMessageId: 1
    })).toThrowError(expect.objectContaining({ code: 'CHAT_NOT_FOUND' }))
    expect(() => harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: 999
    })).toThrowError(expect.objectContaining({ code: 'MESSAGE_NOT_FOUND' }))
    expect(harness.state.chats).toHaveLength(1)
    expect(harness.state.messages).toEqual([])
  })

  it('accepts a historical terminal assistant without renderer completion metadata', () => {
    const harness = createHarness()
    harness.addMessage(userMessage('hello', 100))
    const boundaryId = harness.addMessage({
      role: 'assistant',
      content: 'historical answer',
      segments: [],
      createdAt: 200
    })

    const result = harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: boundaryId
    })

    expect(result.messages.at(-1)?.body).toMatchObject({
      role: 'assistant',
      content: 'historical answer'
    })
    expect(result.messages.at(-1)?.body.typewriterCompleted).toBeUndefined()
  })

  it('numbers consecutive and nested forks across one lineage', () => {
    const harness = createHarness()
    harness.addMessage(userMessage('hello', 100))
    const boundaryId = harness.addMessage(assistantMessage('answer', 200))

    const first = harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: boundaryId
    })
    const second = harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: boundaryId
    })
    const nested = harness.repository.forkChat({
      sourceChatId: first.chat.id!,
      sourceChatUuid: first.chat.uuid,
      forkedFromMessageId: first.messages.at(-1)!.id!
    })

    expect([first.chat.title, second.chat.title, nested.chat.title]).toEqual([
      'Source title (1)',
      'Source title (2)',
      'Source title (3)'
    ])
  })

  it('continues from the maximum existing lineage number and isolates separate lineages', () => {
    const harness = createHarness()
    harness.state.chats.push(
      {
        ...sourceChatRow(),
        id: 2,
        uuid: 'existing-branch',
        title: 'Source title (4)',
        parent_chat_uuid: 'source-chat'
      },
      {
        ...sourceChatRow(),
        id: 3,
        uuid: 'other-source',
        title: 'Source title'
      }
    )
    const sourceBoundaryId = harness.addMessage(assistantMessage('source answer', 100))
    const otherBoundaryId = harness.addMessage(
      assistantMessage('other answer', 100),
      { id: 3, uuid: 'other-source' }
    )

    const sourceFork = harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: sourceBoundaryId
    })
    const otherFork = harness.repository.forkChat({
      sourceChatId: 3,
      sourceChatUuid: 'other-source',
      forkedFromMessageId: otherBoundaryId
    })

    expect(sourceFork.chat.title).toBe('Source title (5)')
    expect(otherFork.chat.title).toBe('Source title (1)')
  })

  it('falls back to the selected source for missing parents and lineage cycles', () => {
    const harness = createHarness()
    harness.state.chats.push(
      {
        ...sourceChatRow(),
        id: 2,
        uuid: 'orphan-source',
        title: 'Orphan title',
        parent_chat_uuid: 'missing-parent'
      },
      {
        ...sourceChatRow(),
        id: 3,
        uuid: 'cycle-a',
        title: 'Cycle title',
        parent_chat_uuid: 'cycle-b'
      },
      {
        ...sourceChatRow(),
        id: 4,
        uuid: 'cycle-b',
        title: 'Other cycle title',
        parent_chat_uuid: 'cycle-a'
      }
    )
    const orphanBoundaryId = harness.addMessage(
      assistantMessage('orphan answer', 100),
      { id: 2, uuid: 'orphan-source' }
    )
    const cycleBoundaryId = harness.addMessage(
      assistantMessage('cycle answer', 100),
      { id: 3, uuid: 'cycle-a' }
    )

    const orphanFork = harness.repository.forkChat({
      sourceChatId: 2,
      sourceChatUuid: 'orphan-source',
      forkedFromMessageId: orphanBoundaryId
    })
    const cycleFork = harness.repository.forkChat({
      sourceChatId: 3,
      sourceChatUuid: 'cycle-a',
      forkedFromMessageId: cycleBoundaryId
    })

    expect(orphanFork.chat.title).toBe('Orphan title (1)')
    expect(cycleFork.chat.title).toBe('Cycle title (1)')
  })

  it('rolls back all copied rows when a transactional write fails', () => {
    const harness = createHarness({ failSearchAfter: 1 })
    harness.addMessage(userMessage('hello', 100))
    const boundaryId = harness.addMessage(assistantMessage('answer', 200))
    const sourceMessageCount = harness.state.messages.length

    expect(() => harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: boundaryId
    })).toThrow('search projection failed')

    expect(harness.state.chats).toHaveLength(1)
    expect(harness.state.messages).toHaveLength(sourceMessageCount)
    expect(harness.state.searchMessageIds).toEqual([])

    const retry = harness.repository.forkChat({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: boundaryId
    })
    expect(retry.chat.title).toBe('Source title (1)')
  })
})

function createHarness(options: { failSearchAfter?: number } = {}): Harness {
  const state: State = {
    chats: [sourceChatRow()],
    messages: [],
    skills: [],
    workContexts: [],
    summaries: [],
    compactions: [],
    searchMessageIds: []
  }
  let nextMessageId = 1
  let nextSummaryId = 10
  let nextCompactionId = 20
  let nextBranchNumber = 1
  let remainingSearchFailures = options.failSearchAfter === undefined ? 0 : 1
  const transaction = vi.fn((operation: (request: ChatForkRequest) => ChatForkResult) => {
    const run = (request: ChatForkRequest): ChatForkResult => {
      const snapshot = structuredClone(state)
      try {
        return operation(request)
      } catch (error) {
        restoreState(state, snapshot)
        throw error
      }
    }
    run.immediate = run
    return run
  })
  const chatDao = {
    getChatById: (id: number): ChatRow | undefined => state.chats.find(row => row.id === id),
    getAllChats: (): ChatRow[] => [...state.chats],
    insertChat: (row: ChatRow): number => {
      const id = Math.max(...state.chats.map(chat => chat.id)) + 1
      state.chats.push({ ...row, id })
      return id
    },
    updateMessageCount: (id: number, delta: number): void => {
      const chat = state.chats.find(row => row.id === id)!
      chat.msg_count += delta
    }
  }
  const messageDao = {
    getMessagesByChatUuid: (uuid: string): MessageRow[] => (
      state.messages.filter(row => row.chat_uuid === uuid)
    ),
    insertMessage: (row: Omit<MessageRow, 'id'>): number => {
      const id = nextMessageId++
      state.messages.push({ ...row, id })
      return id
    }
  }
  const skillDao = {
    getSkills: (chatId: number): SkillRow[] => state.skills.filter(row => row.chat_id === chatId),
    insertSkill: (row: SkillRow): void => {
      state.skills.push(row)
    }
  }
  const workContextDao = {
    getByChatId: (chatId: number): WorkContextRow | undefined => (
      state.workContexts.find(row => row.chat_id === chatId)
    ),
    upsert: (row: WorkContextRow): void => {
      state.workContexts.push(row)
    }
  }
  const summaryDao = {
    getByChatId: (chatId: number): CompressedSummaryRow[] => (
      state.summaries.filter(row => row.chat_id === chatId)
    ),
    insert: (row: Omit<CompressedSummaryRow, 'id'>): number => {
      const id = nextSummaryId++
      state.summaries.push({ ...row, id })
      return id
    }
  }
  const compactionDao = {
    getReadyByMessageIds: (ids: number[]): ToolResultCompactionRow[] => state.compactions.filter(row => (
      ids.includes(row.message_id) && row.status === 'ready'
    )),
    insertReadySnapshot: (row: Omit<ToolResultCompactionRow, 'id'>): number => {
      const id = nextCompactionId++
      state.compactions.push({ ...row, id })
      return id
    }
  }
  const repository = new ChatBranchRepository({
    db: { transaction } as unknown as Database.Database,
    chatDao: chatDao as unknown as ChatDao,
    messageDao: messageDao as unknown as MessageDao,
    messageSearchDao: {
      syncMessage: (row: MessageRow): void => {
        if (
          options.failSearchAfter !== undefined
          && state.searchMessageIds.length >= options.failSearchAfter
          && remainingSearchFailures > 0
        ) {
          remainingSearchFailures -= 1
          throw new Error('search projection failed')
        }
        state.searchMessageIds.push(row.id)
      }
    } as unknown as MessageSearchDao,
    skillDao: skillDao as unknown as SkillDao,
    workContextDao: workContextDao as unknown as WorkContextDao,
    compressedSummaryDao: summaryDao as unknown as CompressedSummaryDao,
    toolResultCompactionDao: compactionDao as unknown as ToolResultCompactionDao,
    now: (): number => 2_000,
    uuid: (): string => nextBranchNumber++ === 1 ? 'branch-chat' : `branch-chat-${nextBranchNumber - 1}`
  })

  return {
    state,
    repository,
    transaction,
    addMessage: (body: ChatMessage, chat = { id: 1, uuid: 'source-chat' }): number => messageDao.insertMessage({
      chat_id: chat.id,
      chat_uuid: chat.uuid,
      body: JSON.stringify(body),
      tokens: 12,
      token_usage: JSON.stringify({ promptTokens: 5, completionTokens: 7, totalTokens: 12 })
    })
  }
}

function restoreState(target: State, snapshot: State): void {
  for (const key of Object.keys(target) as Array<keyof State>) {
    target[key].splice(0, target[key].length, ...snapshot[key] as never[])
  }
}

function sourceChatRow(): ChatRow {
  return {
    id: 1,
    uuid: 'source-chat',
    title: 'Source title',
    msg_count: 0,
    model_account_id: 'source-account',
    model_model_id: 'source-model',
    workspace_path: '/workspace/source',
    user_instruction: 'keep context',
    permission_approval_mode: 'auto',
    parent_chat_uuid: null,
    forked_from_message_id: null,
    forked_at: null,
    create_time: 100,
    update_time: 200
  }
}

function userMessage(content: string, createdAt: number): ChatMessage {
  return { role: 'user', content, segments: [], createdAt }
}

function assistantMessage(
  content: string,
  createdAt: number,
  modelRef?: ModelRef,
  toolCalls?: IToolCall[],
  typewriterCompleted: boolean | undefined = true
): ChatMessage {
  return {
    role: 'assistant',
    content,
    segments: [],
    createdAt,
    ...(typewriterCompleted === undefined ? {} : { typewriterCompleted }),
    ...(modelRef ? { modelRef } : {}),
    ...(toolCalls ? { toolCalls } : {})
  }
}

function summaryRow(
  messageIds: number[],
  summary: string,
  compressedAt: number,
  status: 'active' | 'superseded',
  id: number
): CompressedSummaryRow {
  return {
    id,
    chat_id: 1,
    chat_uuid: 'source-chat',
    message_ids: JSON.stringify(messageIds),
    start_message_id: messageIds[0],
    end_message_id: messageIds[messageIds.length - 1],
    summary,
    original_token_count: 100,
    summary_token_count: 20,
    used_token_count_at_compression: 120,
    compression_ratio: 0.2,
    compressed_at: compressedAt,
    compression_model: 'compact-model',
    compression_version: 2,
    status
  }
}

function readyCompactionRow(
  messageId: number,
  originalHash: string,
  toolCallId: string,
  id: number,
  level: 'balanced' | 'minimal' = 'balanced'
): ToolResultCompactionRow {
  return {
    id,
    message_id: messageId,
    tool_name: 'web_fetch',
    tool_call_id: toolCallId,
    level,
    status: 'ready',
    content: 'compact result',
    original_hash: originalHash,
    original_characters: 15,
    compacted_characters: 14,
    estimated_tokens: 4,
    execution_type: 'model',
    model_id: 'compact-model',
    prompt_version: 'v1',
    prompt_tokens: 10,
    completion_tokens: 4,
    latency_ms: 50,
    input_characters: 15,
    sent_characters: 15,
    input_truncated: 0,
    redaction_count: 0,
    compactor_id: 'web-document',
    compactor_version: 1,
    attempts: 1,
    last_error_code: null,
    created_at: 500,
    updated_at: 600
  }
}
