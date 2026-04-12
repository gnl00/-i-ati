import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'
import { RUN_EVENT } from '@shared/constants'

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
    isDestroyed: () => false,
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
})
