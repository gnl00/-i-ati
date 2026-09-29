import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunResult, RunEventSink } from '@main/agent/contracts'
import type { RunEventPayloads, RunEventType } from '@shared/run/events'
import type { MainAgentRunInput } from '@main/orchestration/chat/run'
vi.mock('@main/db/chat', () => ({ chatDb: {} }))
vi.mock('@main/db/config', () => ({ configDb: {} }))
vi.mock('@main/orchestration/chat/run', () => ({ RunService: class {} }))
import { TuiSession } from '../TuiSession'

const ref = { accountId: 'account', modelId: 'model' }
let chats: ChatEntity[]
const saved = new Map<string, string>()
let finish: (result: RunResult) => void
let sink: RunEventSink
const execute = vi.fn((_input: MainAgentRunInput, options: { eventSinks: RunEventSink[] }) => {
  sink = options.eventSinks[0]
  return new Promise<RunResult>((resolve) => {
    finish = resolve
  })
})
const cancel = vi.fn(() => ({ cancelled: true }))
const steer = vi.fn(() => ({ accepted: true }))
const submitToolConfirmation = vi.fn((request) => ({ ok: true as const, confirmation: { ...request, name: 'command', status: request.approved ? 'approved' as const : 'denied' as const, createdAt: 1, expiresAt: 300001, version: 2 } }))
const submitToolUserQuestion = vi.fn(() => ({ ok: true as const }))
function setup(): TuiSession {
  const session = new TuiSession(
    '/workspace',
    {
      waitForPostRunJobs: async (): Promise<void> => {},
      execute,
      cancel,
      steer,
      submitToolConfirmation,
      submitToolUserQuestion
    },
    {
      saveChat: (chat): number => {
        chats.push(chat)
        return chats.length
      },
      updateChat: (chat): void => {
        chats[chats.findIndex((c): boolean => c.uuid === chat.uuid)] = chat
      },
      getAllChats: (): ChatEntity[] => chats,
      getChatByUuid: (uuid): ChatEntity | undefined => chats.find((c): boolean => c.uuid === uuid),
      getMessagesByChatUuid: (): never[] => []
    },
    {
      getConfigValue: (key): string | undefined => saved.get(key),
      saveConfigValue: (key, value): void => {
        saved.set(key, value)
      },
      getConfig: (): {
        providerDefinitions: { id: string; displayName: string; adapterPluginId: string }[]
        accounts: {
          id: string
          label: string
          providerId: string
          apiKey: string
          apiUrl: string
          models: { id: string; type: 'llm'; label: string }[]
        }[]
        tools: { mainModel: { accountId: string; modelId: string } }
      } => ({
        providerDefinitions: [
          { id: 'provider', displayName: 'Provider', adapterPluginId: 'openai' }
        ],
        accounts: [
          {
            id: 'account',
            label: 'Account',
            providerId: 'provider',
            apiKey: 'secret',
            apiUrl: 'http://local',
            models: [{ id: 'model', type: 'llm', label: 'Model' }]
          }
        ],
        tools: { mainModel: ref }
      })
    }
  )
  session.initialize()
  return session
}
async function emit<T extends RunEventType>(
  session: TuiSession,
  type: T,
  payload: RunEventPayloads[T]
): Promise<void> {
  await sink.handleEvent({
    type,
    payload,
    submissionId: session.state.activeRun!,
    chatUuid: session.state.chat!.uuid,
    sequence: 1,
    timestamp: 1
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  chats = []
  saved.clear()
  steer.mockReturnValue({ accepted: true })
})

describe('TUI session lifecycle', () => {
  it('uses the same persisted session for multiple turns and the Chat request path', async () => {
    const session = setup()
    const uuid = session.state.chat!.uuid
    await session.submit('first')
    expect(execute.mock.calls[0][0]).toMatchObject({
      chatUuid: uuid,
      modelRef: ref,
      input: { textCtx: 'first', source: 'tui' }
    })
    await emit(session, 'tool.call.detected', { toolCall: { id: 'old-tool', name: 'exec', args: '{}', status: 'pending' } })
    finish({ state: 'completed' })
    await vi.waitFor(() => expect(session.state.activeRun).toBeUndefined())
    await session.submit('second')
    expect(session.state.tools.size).toBe(0)
    expect(execute.mock.calls[1][0].chatUuid).toBe(uuid)
    finish({ state: 'completed' })
    await session.close()
  })
  it('acknowledges steering and runs a follow-up only after successful completion', async () => {
    const session = setup()
    await session.submit('first')
    await session.submit('steering')
    const id = session.state.queue[0].id
    expect(steer).toHaveBeenCalledWith(
      expect.objectContaining({ queueItemId: id, text: 'steering' })
    )
    expect(session.state.queue).toHaveLength(1)
    await emit(session, 'run.steering.consumed', { queueItemId: id })
    await session.submit('later', 'followUp')
    finish({ state: 'completed' })
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2))
    expect(execute.mock.calls[1][0].input.textCtx).toBe('later')
    finish({ state: 'completed' })
    await session.close()
  })
  it('retains unconsumed input on cancellation without starting it again', async () => {
    const session = setup()
    await session.submit('first')
    await session.submit('steer')
    await session.submit('follow', 'followUp')
    session.cancel()
    finish({ state: 'aborted' })
    await vi.waitFor(() => expect(session.state.activeRun).toBeUndefined())
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.state.queue.map((i) => i.mode)).toEqual(['returned', 'followUp'])
    expect(session.recoverQueue()).toBe('steer\n\nfollow')
    expect(session.state.queue).toEqual([])
  })
  it('rejects session/model switches while executing and ignores stale answers', async () => {
    const session = setup()
    await session.submit('first')
    expect(() => session.newChat()).toThrow()
    expect(() => session.setModel(ref)).toThrow()
    await emit(session, 'tool.confirmation.required', { toolCallId: 'tool', name: 'command', confirmationId: 'approval', submissionId: session.state.activeRun!, chatUuid: session.state.chat!.uuid, status: 'pending', version: 1, createdAt: 1, expiresAt: 300001 })
    const interaction = session.state.interactions[0]
    session.answer(interaction, false)
    expect(submitToolConfirmation).toHaveBeenCalledWith({
      confirmationId: 'approval', submissionId: session.state.activeRun, chatUuid: session.state.chat!.uuid, toolCallId: 'tool',
      approved: false,
      reason: 'user_denied'
    }, 'tui')
    expect(() => session.answer(interaction, true)).toThrow()
    finish({ state: 'completed' })
    await session.close()
  })
  it('keeps an unresolved steering item visible if the run finishes before its checkpoint', async () => {
    const session = setup()
    await session.submit('first')
    await session.submit('pending')
    await session.submit('follow', 'followUp')
    finish({ state: 'completed' })
    await vi.waitFor(() => expect(session.state.activeRun).toBeUndefined())
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.state.queue[0].mode).toBe('returned')
  })
  it('restores an unsent draft and pending inputs without sending them', async () => {
    const session = setup()
    const uuid = session.state.chat!.uuid
    session.state.draft = 'draft 中文'
    session.state.queue = [{ id: 'pending', text: 'unsent', mode: 'followUp' }]
    await session.close()
    const next = setup()
    next.resume(uuid)
    expect(next.state.draft).toBe('draft 中文')
    expect(next.state.queue[0]).toMatchObject({ text: 'unsent', mode: 'returned' })
    expect(execute).not.toHaveBeenCalled()
  })
})
