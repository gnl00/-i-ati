import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_FORK,
  DB_CHAT_SEARCH,
  RUN_CANCEL,
  RUN_COMPRESSION_EXECUTE,
  RUN_PERMISSION_APPROVAL_MODE_UPDATE,
  RUN_START,
  RUN_STEER,
  RUN_TITLE_GENERATE,
  RUN_TOOL_CONFIRM,
  RUN_TOOL_USER_QUESTION_LIST_PENDING,
  RUN_TOOL_USER_QUESTION_SUBMIT
} from '@shared/constants'

const {
  ipcMainHandleMock,
  runServiceSteerMock,
  runServiceSubmitQuestionMock,
  runServiceListQuestionsMock,
  forkChatMock
} = vi.hoisted(() => ({
  ipcMainHandleMock: vi.fn(),
  runServiceSteerMock: vi.fn(),
  runServiceSubmitQuestionMock: vi.fn(),
  runServiceListQuestionsMock: vi.fn(),
  forkChatMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandleMock
  }
}))

vi.mock('@main/orchestration/chat/run', () => ({
  RunService: class {
    start = vi.fn()
    cancel = vi.fn()
    resolveToolConfirmation = vi.fn()
    submitToolUserQuestion = runServiceSubmitQuestionMock
    listPendingToolUserQuestions = runServiceListQuestionsMock
    steer = runServiceSteerMock
    updatePermissionApprovalModeForChat = vi.fn()
    executeCompression = vi.fn()
    generateTitle = vi.fn()
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveChat: vi.fn(),
    getAllChats: vi.fn(),
    getChatById: vi.fn(),
    getChatHostBindingsByChatUuid: vi.fn(() => []),
    searchChats: vi.fn(),
    updateChat: vi.fn(),
    deleteChat: vi.fn(),
    forkChat: forkChatMock,
    addSkill: vi.fn(),
    removeSkill: vi.fn(),
    getSkills: vi.fn()
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

describe('registerChatHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
    runServiceSteerMock.mockReset()
    runServiceSubmitQuestionMock.mockReset()
    runServiceListQuestionsMock.mockReset()
    forkChatMock.mockReset()
  })

  it('routes user-question submit and hydration requests through RunService', async () => {
    const { registerChatHandlers } = await import('../chat')
    registerChatHandlers()
    const submitHandler = ipcMainHandleMock.mock.calls
      .find(([channel]) => channel === RUN_TOOL_USER_QUESTION_SUBMIT)?.[1]
    const listHandler = ipcMainHandleMock.mock.calls
      .find(([channel]) => channel === RUN_TOOL_USER_QUESTION_LIST_PENDING)?.[1]
    const request = {
      action: 'submit',
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      toolCallId: 'call-1',
      interactionId: 'interaction-1',
      answers: [{ questionId: 'choice', optionIds: ['recommended'] }]
    }
    runServiceSubmitQuestionMock.mockReturnValue({ ok: true })
    runServiceListQuestionsMock.mockReturnValue([{ interactionId: 'interaction-1' }])

    await expect(submitHandler({}, request)).resolves.toEqual({ ok: true })
    expect(runServiceSubmitQuestionMock).toHaveBeenCalledWith(request)
    await expect(listHandler({}, { chatUuid: 'chat-1' })).resolves.toEqual({
      questions: [{ interactionId: 'interaction-1' }]
    })
    expect(runServiceListQuestionsMock).toHaveBeenCalledWith('chat-1')
    await expect(listHandler({}, undefined)).resolves.toEqual({ questions: [] })
  })

  it('registers run handlers on new run:* channels while keeping legacy request aliases', async () => {
    const { registerChatHandlers } = await import('../chat')

    registerChatHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)

    expect(registeredChannels).toContain(RUN_START)
    expect(registeredChannels).toContain(DB_CHAT_SEARCH)
    expect(registeredChannels).toContain(CHAT_FORK)
    expect(registeredChannels).toContain('chat-run:start')
    expect(registeredChannels).toContain(RUN_CANCEL)
    expect(registeredChannels).toContain('chat-run:cancel')
    expect(registeredChannels).toContain(RUN_TOOL_CONFIRM)
    expect(registeredChannels).toContain(RUN_TOOL_USER_QUESTION_SUBMIT)
    expect(registeredChannels).toContain(RUN_TOOL_USER_QUESTION_LIST_PENDING)
    expect(registeredChannels).toContain(RUN_STEER)
    expect(registeredChannels).toContain('chat-run:tool-confirm')
    expect(registeredChannels).toContain(RUN_PERMISSION_APPROVAL_MODE_UPDATE)
    expect(registeredChannels).toContain(RUN_COMPRESSION_EXECUTE)
    expect(registeredChannels).toContain('chat-compression:execute')
    expect(registeredChannels).toContain(RUN_TITLE_GENERATE)
    expect(registeredChannels).toContain('chat-title:generate')
    expect(registeredChannels).not.toContain('chat-run:event')
  })

  it('routes chat fork requests through the database facade', async () => {
    const request: ChatForkRequest = {
      sourceChatId: 7,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: 42
    }
    const result: ChatForkResult = {
      chat: {
        id: 8,
        uuid: 'branch-chat',
        title: 'Branch',
        messages: [101],
        createTime: 1,
        updateTime: 1
      },
      messages: [{
        id: 101,
        chatId: 8,
        chatUuid: 'branch-chat',
        body: {
          role: 'assistant',
          content: 'answer',
          segments: [],
          typewriterCompleted: true
        }
      }]
    }
    forkChatMock.mockReturnValue(result)
    const { registerChatHandlers } = await import('../chat')

    registerChatHandlers()
    const handler = ipcMainHandleMock.mock.calls.find(([channel]) => channel === CHAT_FORK)?.[1]

    await expect(handler({}, request)).resolves.toEqual(result)
    expect(forkChatMock).toHaveBeenCalledWith(request)
  })

  it('rejects malformed run steering input before it reaches the run service', async () => {
    const { registerChatHandlers } = await import('../chat')
    registerChatHandlers()
    const handler = ipcMainHandleMock.mock.calls.find(([channel]) => channel === RUN_STEER)?.[1]

    await expect(handler({}, {
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      queueItemId: 'queue-1',
      text: null,
      images: null
    })).resolves.toEqual({ accepted: false, reason: 'invalid_request' })
    expect(runServiceSteerMock).not.toHaveBeenCalled()

    const validRequest = {
      submissionId: 'submission-1',
      chatUuid: 'chat-1',
      queueItemId: 'queue-1',
      text: 'guide',
      images: [null]
    }
    runServiceSteerMock.mockReturnValue({ accepted: true })
    await expect(handler({}, validRequest)).resolves.toEqual({ accepted: true })
    expect(runServiceSteerMock).toHaveBeenCalledWith(validRequest)
  })
})
