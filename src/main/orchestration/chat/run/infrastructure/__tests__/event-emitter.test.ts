import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RUN_EVENTS, type RunEventPayloads, type RunEventType } from '@shared/run/events'
import { RUN_EVENT } from '@shared/constants'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'

const {
  saveRunEventMock,
  webContentsSendMock
} = vi.hoisted(() => ({
  saveRunEventMock: vi.fn(),
  webContentsSendMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveRunEvent: saveRunEventMock
  }
}))

vi.mock('@main/main-window', () => ({
  mainWindow: {
    isDestroyed: (): boolean => false,
    webContents: {
      send: webContentsSendMock
    }
  }
}))

import { RunEventEmitter } from '../event-emitter'

describe('RunEventEmitter', () => {
  beforeEach(() => {
    saveRunEventMock.mockReset()
    webContentsSendMock.mockReset()
  })

  it('fans out emitted events to configured sinks while preserving db/ipc emission', async () => {
    const sink = {
      handleEvent: vi.fn()
    }
    const emitter = new RunEventEmitter({
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1'
    }, [sink])

    emitter.emit(RUN_EVENTS.RUN_ACCEPTED, {
      accepted: true,
      submissionId: 'submission-1'
    })

    expect(saveRunEventMock).toHaveBeenCalledTimes(1)
    expect(webContentsSendMock).toHaveBeenCalledTimes(1)
    expect(webContentsSendMock).toHaveBeenCalledWith(
      RUN_EVENT,
      expect.objectContaining({
        type: RUN_EVENTS.RUN_ACCEPTED,
        submissionId: 'submission-1'
      })
    )
    expect(sink.handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: RUN_EVENTS.RUN_ACCEPTED,
        submissionId: 'submission-1'
      })
    )
  })

  it('delivers transport-only events to ipc and sinks without persisting trace rows', () => {
    const sink = {
      handleEvent: vi.fn()
    }
    const emitter = new RunEventEmitter({
      submissionId: 'submission-output',
      chatId: 1,
      chatUuid: 'chat-1'
    }, [sink])

    emitter.emit(RUN_EVENTS.RUN_ACCEPTED, {
      accepted: true,
      submissionId: 'submission-output'
    })
    const transportOnlyEvents: RunEventType[] = [
      ...Object.values(CHAT_RENDER_EVENTS),
      CHAT_HOST_EVENTS.MESSAGES_LOADED,
      RUN_EVENTS.TOOL_EXECUTION_OUTPUT
    ]
    for (const type of transportOnlyEvents) {
      emitter.emit(type, {} as RunEventPayloads[typeof type])
    }
    emitter.emit(RUN_EVENTS.RUN_STATE_CHANGED, {
      state: 'streaming'
    })

    expect(saveRunEventMock).toHaveBeenCalledTimes(2)
    expect(saveRunEventMock.mock.calls.map(([event]) => event.sequence)).toEqual([
      1,
      transportOnlyEvents.length + 2
    ])
    expect(webContentsSendMock.mock.calls.map(([, event]) => event.type)).toEqual([
      RUN_EVENTS.RUN_ACCEPTED,
      ...transportOnlyEvents,
      RUN_EVENTS.RUN_STATE_CHANGED
    ])
    expect(sink.handleEvent).toHaveBeenCalledTimes(transportOnlyEvents.length + 2)
  })
})
