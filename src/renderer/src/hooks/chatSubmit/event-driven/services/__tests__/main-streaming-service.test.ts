import { describe, expect, it, vi } from 'vitest'
import { MainDrivenStreamingService } from '../main-streaming-service'
import { extractContentFromSegments } from '../../streaming/segment-utils'

let activeHandler: ((event: any) => void) | null = null

vi.mock('@renderer/invoker/ipcInvoker', () => ({
  invokeChatSubmit: vi.fn(async ({ submissionId }: { submissionId: string }) => {
    if (!activeHandler) {
      throw new Error('missing event handler')
    }

    let sequence = 1
    activeHandler({
      submissionId,
      sequence: sequence++,
      timestamp: Date.now(),
      type: 'stream.started',
      payload: { stream: true }
    })

    for (let i = 0; i < 10; i++) {
      activeHandler({
        submissionId,
        sequence: sequence++,
        timestamp: Date.now(),
        type: 'stream.chunk',
        payload: { contentDelta: String(i) }
      })
    }

    await new Promise(resolve => setTimeout(resolve, 30))

    activeHandler({
      submissionId,
      sequence: sequence++,
      timestamp: Date.now(),
      type: 'stream.completed',
      payload: { ok: true }
    })

    return { accepted: true, submissionId }
  }),
  invokeChatSubmitCancel: vi.fn(async () => ({ cancelled: true })),
  subscribeChatSubmitEvents: vi.fn((handler: (event: any) => void) => {
    activeHandler = handler
    return () => {
      if (activeHandler === handler) {
        activeHandler = null
      }
    }
  })
}))

describe('MainDrivenStreamingService', () => {
  it('batches stream chunks before updating assistant message', async () => {
    const service = new MainDrivenStreamingService({
      updateLastAssistantMessage: (context: any, updater: any) => {
        updateCount += 1
        const entities = context.session.messageEntities
        for (let i = entities.length - 1; i >= 0; i--) {
          if (entities[i].body.role === 'assistant') {
            entities[i] = updater(entities[i])
            break
          }
        }
      },
      addToolCallMessage: vi.fn()
    } as any)

    let updateCount = 0
    const context: any = {
      input: {
        textCtx: 'hello',
        mediaCtx: [],
        stream: true
      },
      meta: {
        account: { id: 'account-1' },
        model: { id: 'model-1' }
      },
      session: {
        currChatId: 1,
        chatEntity: {
          uuid: 'chat-1',
          messages: []
        },
        messageEntities: [
          {
            id: 1,
            body: {
              role: 'assistant',
              content: '',
              segments: []
            }
          }
        ]
      },
      control: {
        signal: new AbortController().signal
      }
    }

    await service.run(
      context,
      { emit: vi.fn(async () => {}) } as any,
      { submissionId: 'submission-1' }
    )

    const assistant = context.session.messageEntities[0]
    const content = extractContentFromSegments(assistant.body.segments)

    expect(content).toBe('0123456789')
    expect(updateCount).toBeLessThan(10)
  })
})
