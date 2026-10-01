import { describe, expect, it } from 'vitest'
import { boundRequestMessages, type MaterializedProtocolMessage } from '../RequestMaterializer'
const spec = {
  adapterPluginId: 'test',
  baseUrl: '',
  apiKey: '',
  model: 'test',
  contextWindowTokens: 2_000
}
const group = (id: string): MaterializedProtocolMessage[] => [
  {
    role: 'assistant',
    content: '',
    toolCalls: [{ id, type: 'function', function: { name: 'exec', arguments: '{}' } }]
  },
  {
    role: 'tool',
    toolCallId: id,
    toolName: 'exec',
    content: id + 'x'.repeat(500)
  }
]
describe('request context budget', () => {
  it('drops complete oldest pairs while preserving instructions and the newest result byte-for-byte', () => {
    const instructions: MaterializedProtocolMessage = {
      role: 'user',
      content: [{ type: 'input_text', text: 'user goal' }]
    }
    const messages = [instructions, ...group('a'), ...group('b'), ...group('c')]
    const result = boundRequestMessages(messages, spec)
    expect(result).toContain(instructions)
    expect(result.at(-1)).toBe(messages.at(-1))
    expect(
      result.filter((message) => message.role === 'tool').map((message) => message.toolCallId)
    ).toEqual(['c'])
    expect(JSON.stringify(result)).toContain('Earlier assistant/tool groups omitted')
    expect(messages).toHaveLength(7)
  })
  it('includes system prompt and tool definitions in the budget and rejects oversized mandatory input', () => {
    expect(() =>
      boundRequestMessages(group('c'), {
        ...spec,
        systemPrompt: 'x'.repeat(2_000)
      })
    ).toThrow('Request context budget exceeded')
    expect(() =>
      boundRequestMessages(
        [
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'x'.repeat(2_000) }]
          }
        ],
        spec
      )
    ).toThrow('Request context budget exceeded')
  })
  it('preserves the original request when it fits', () => {
    const messages = group('c')
    expect(boundRequestMessages(messages, spec)).toBe(messages)
  })
})
