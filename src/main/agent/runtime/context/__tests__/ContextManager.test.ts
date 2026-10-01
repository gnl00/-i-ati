import { describe, expect, it, vi } from 'vitest'
import { ContextManager } from '../ContextManager'
import type { ContextRecord, ContextToolResultRecord } from '../../context/ContextRecord'
import type { AgentRequestSpec } from '../../request/AgentRequestSpec'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

vi.mock('@main/request', () => ({ unifiedChatRequest: vi.fn() }))
vi.mock('@main/logging/LogService', () => ({
  createLogger: (): { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } => ({
    info: vi.fn(),
    warn: vi.fn()
  })
}))

const spec: AgentRequestSpec = {
  adapterPluginId: 'test',
  apiKey: '',
  baseUrl: '',
  model: 'unknown',
  contextWindowTokens: 2_000,
  contextCompression: false
}
const user = (text: string, id = text, source?: string): ContextRecord => ({
  kind: 'user',
  recordId: id,
  timestamp: 1,
  source,
  content: [{ type: 'input_text', text }]
})
const assistant = (id: string, calls: IToolCall[] = [], text = ''): ContextRecord => ({
  kind: 'assistant_step',
  recordId: id,
  timestamp: 2,
  step: {
    status: 'completed',
    stepId: id,
    stepIndex: 0,
    startedAt: 1,
    completedAt: 2,
    content: text,
    toolCalls: calls
  }
})
const call = (id: string): IToolCall => ({
  id,
  type: 'function',
  function: { name: 'exec', arguments: '{}' }
})
const result = (
  id: string,
  step = 'step',
  text = 'stable tool evidence'
): ContextToolResultRecord => ({
  kind: 'tool_result',
  recordId: id,
  timestamp: 3,
  stepId: step,
  toolCallId: id,
  toolCallIndex: 0,
  toolName: 'exec',
  status: 'success',
  content: 'RAW',
  modelContent: text
})
const history = (size = 3_000): ContextRecord[] => [
  user('old goal'),
  assistant('old', [], 'evidence line\n'.repeat(size)),
  user('current goal')
]
const manager = (records: ContextRecord[], request = spec, options = {}): ContextManager =>
  new ContextManager(records, request, { id: 'run', timestamp: 1 }, options)

describe('ContextManager', () => {
  it('regression: million-token model accepts a short follow-up after a large aggregated historical tool group', async () => {
    const calls = Array.from({ length: 11 }, (_, i) => call(`c${i}`))
    const records = [
      user('previous goal'),
      assistant('historical', calls),
      ...calls.map((c) => result(c.id, 'historical', 'evidence\n'.repeat(350))),
      user('short follow-up')
    ]
    const requestSpec = {
      ...spec,
      contextWindowTokens: 1_000_000,
      systemPrompt: 'policy\n'.repeat(6_000),
      tools: [{ description: 'tool definition\n'.repeat(6_000) }]
    }
    const request = await manager(records, requestSpec).prepare()
    expect(JSON.stringify(request).length).toBeGreaterThan(128_000)
    expect(request.messages.filter((message) => message.role === 'tool')).toHaveLength(11)
    expect(JSON.stringify(request.messages)).toContain('short follow-up')
  })

  it('omits complete historical batches without rewriting records or mutating caller arrays', async () => {
    const records = [
      user('old goal'),
      assistant('old', [call('old-call')]),
      result('old-call', 'old', 'old evidence\n'.repeat(3_000)),
      user('current goal')
    ]
    const before = JSON.stringify(records)
    const context = manager(records)
    const request = await context.prepare()
    expect(request.messages.some((message) => message.role === 'tool')).toBe(false)
    expect(
      request.messages.some((message) => message.role === 'assistant' && message.toolCalls?.length)
    ).toBe(false)
    expect(JSON.stringify(request.messages)).toContain('current goal')
    expect(JSON.stringify(request.messages)).toContain('Earlier context was omitted')
    expect(JSON.stringify(records)).toBe(before)
    expect(context.snapshot().records).toEqual(records)
  })

  it('compresses once, reuses the run-local summary and protects tools plus steering byte-for-byte', async () => {
    const compress = vi.fn().mockResolvedValue('old facts summarized')
    const context = manager(history(), { ...spec, contextCompression: true }, { compress })
    context.append(
      [
        assistant('step', [call('a'), call('b')]),
        result('a'),
        { ...result('b'), status: 'denied' },
        user('steering goal')
      ],
      5
    )
    const request = await context.prepare()
    expect(compress).toHaveBeenCalledTimes(1)
    expect(
      request.messages
        .filter((message) => message.role === 'tool')
        .map((message) => message.content)
    ).toEqual(['stable tool evidence', 'stable tool evidence'])
    expect(JSON.stringify(request.messages)).toContain('current goal')
    expect(JSON.stringify(request.messages)).toContain('steering goal')
    expect(JSON.stringify(request.messages)).toContain('old facts summarized')
    await context.prepare()
    expect(compress).toHaveBeenCalledTimes(1)
  })

  it.each(['failure', 'empty', 'oversized'])(
    'sends required input when compression returns %s',
    async (mode) => {
      const compress =
        mode === 'failure'
          ? vi.fn().mockRejectedValue(new Error('failed'))
          : vi.fn().mockResolvedValue(mode === 'empty' ? '' : 'oversized summary\n'.repeat(3_000))
      const request = await manager(
        history(),
        { ...spec, contextCompression: true },
        { compress }
      ).prepare()
      expect(JSON.stringify(request.messages)).toContain('current goal')
      expect(JSON.stringify(request.messages)).toContain('Earlier context was omitted')
      expect(compress).toHaveBeenCalledTimes(1)
    }
  )

  it('stops on cancellation during compaction without dispatching a fallback', async () => {
    const controller = new AbortController()
    const compress = vi.fn(async () => {
      controller.abort()
      return 'summary'
    })
    await expect(
      manager(history(), { ...spec, contextCompression: true }, { compress }).prepare(
        controller.signal
      )
    ).rejects.toThrow()
    expect(compress).toHaveBeenCalledTimes(1)
  })

  it('requires every pending tool result and retains a failed batch for terminal inspection', async () => {
    const context = manager([user('goal')])
    context.append([assistant('step', [call('a'), call('b')]), result('a')], 3)
    await expect(context.prepare()).rejects.toThrow('exactly one result')
    expect(context.snapshot().records).toHaveLength(3)
  })

  it('rejects mandatory overflow, then releases a consumed batch after successful continuation', async () => {
    const context = manager([user('goal')])
    context.append(
      [assistant('step', [call('a')]), result('a', 'step', 'huge evidence\n'.repeat(3_000))],
      3
    )
    await expect(context.prepare()).rejects.toThrow('Required context exceeds')
    context.append([assistant('consumed', [], 'evidence understood'), user('continue')], 4)
    const request = await context.prepare()
    expect(JSON.stringify(request.messages)).toContain('goal')
    expect(JSON.stringify(request.messages)).toContain('continue')
    expect(request.messages.filter((message) => message.role === 'tool')).toHaveLength(0)
  })

  it('uses effective provider body output limits and protects current dynamic context', async () => {
    const measureRequest = vi.fn(async (request: IUnifiedRequest) => ({
      messages: request.messages,
      system: request.systemPrompt,
      max_output_tokens: 1_500
    }))
    await expect(
      manager(
        [
          user('required\n'.repeat(200)),
          user('skill rules', 'skills', MESSAGE_SOURCE.SKILLS_CONTEXT)
        ],
        spec,
        { measureRequest }
      ).prepare()
    ).rejects.toThrow('outputReserve=1500')
    expect(measureRequest).toHaveBeenCalled()
  })
})
