import { describe, expect, it, vi } from 'vitest'
import { ScheduleEventEmitter } from '../event-emitter'

const { sendMock, destroyedMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  destroyedMock: vi.fn(() => false)
}))

vi.mock('@main/main-window', () => ({
  mainWindow: {
    isDestroyed: destroyedMock,
    webContents: {
      send: sendMock
    }
  }
}))

describe('ScheduleEventEmitter', () => {
  it('publishes schedule events over SCHEDULE_EVENT channel', () => {
    const emitter = new ScheduleEventEmitter({ chatId: 1, chatUuid: 'chat-1' })
    emitter.emit('schedule.updated', { task: { id: 'task-1' } })

    expect(sendMock).toHaveBeenCalledTimes(1)
    const [channel, envelope] = sendMock.mock.calls[0]
    expect(channel).toBe('schedule:event')
    expect(envelope.type).toBe('schedule.updated')
    expect(envelope.chatId).toBe(1)
    expect(envelope.chatUuid).toBe('chat-1')
  })
})
