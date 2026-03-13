import { describe, expect, it } from 'vitest'
import { shouldAutoScrollTopOnMessageGrowth } from '../useScrollManagerTop'

const createMessage = (role: ChatMessage['role']): MessageEntity => ({
  id: Math.floor(Math.random() * 100000),
  body: {
    role,
    content: '',
    segments: []
  }
})

describe('shouldAutoScrollTopOnMessageGrowth', () => {
  it('returns true when newly appended messages contain a user message', () => {
    const messages: MessageEntity[] = [
      createMessage('assistant'),
      createMessage('user')
    ]

    expect(shouldAutoScrollTopOnMessageGrowth(messages, 1, 2)).toBe(true)
  })

  it('returns false when only assistant message is appended (streaming phase)', () => {
    const messages: MessageEntity[] = [
      createMessage('user'),
      createMessage('assistant')
    ]

    expect(shouldAutoScrollTopOnMessageGrowth(messages, 1, 2)).toBe(false)
  })

  it('returns false when only tool message is appended', () => {
    const messages: MessageEntity[] = [
      createMessage('assistant'),
      createMessage('tool')
    ]

    expect(shouldAutoScrollTopOnMessageGrowth(messages, 1, 2)).toBe(false)
  })

  it('returns false when length does not increase', () => {
    const messages: MessageEntity[] = [createMessage('assistant')]
    expect(shouldAutoScrollTopOnMessageGrowth(messages, 1, 1)).toBe(false)
    expect(shouldAutoScrollTopOnMessageGrowth(messages, 1, 0)).toBe(false)
  })
})
