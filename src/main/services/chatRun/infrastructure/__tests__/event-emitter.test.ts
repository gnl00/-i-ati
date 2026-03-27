import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import { CHAT_RUN_EVENT } from '@shared/constants'

const {
  saveChatRunEventMock,
  webContentsSendMock
} = vi.hoisted(() => ({
  saveChatRunEventMock: vi.fn(),
  webContentsSendMock: vi.fn()
}))

vi.mock('@main/services/DatabaseService', () => ({
  default: {
    saveChatRunEvent: saveChatRunEventMock
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

import { ChatRunEventEmitter } from '../event-emitter'

describe('ChatRunEventEmitter', () => {
  beforeEach(() => {
    saveChatRunEventMock.mockReset()
    webContentsSendMock.mockReset()
  })

  it('fans out emitted events to configured sinks while preserving db/ipc emission', async () => {
    const sink = {
      handleEvent: vi.fn()
    }
    const emitter = new ChatRunEventEmitter({
      submissionId: 'submission-1',
      chatId: 1,
      chatUuid: 'chat-1'
    }, [sink])

    emitter.emit(CHAT_RUN_EVENTS.RUN_ACCEPTED, {
      accepted: true,
      submissionId: 'submission-1'
    })

    expect(saveChatRunEventMock).toHaveBeenCalledTimes(1)
    expect(webContentsSendMock).toHaveBeenCalledTimes(1)
    expect(webContentsSendMock).toHaveBeenCalledWith(
      CHAT_RUN_EVENT,
      expect.objectContaining({
        type: CHAT_RUN_EVENTS.RUN_ACCEPTED,
        submissionId: 'submission-1'
      })
    )
    expect(sink.handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CHAT_RUN_EVENTS.RUN_ACCEPTED,
        submissionId: 'submission-1'
      })
    )
  })
})
