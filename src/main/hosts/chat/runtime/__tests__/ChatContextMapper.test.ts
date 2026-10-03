import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { LoopIdentityProvider } from '@main/agent/contracts/HostRuntimeContracts'
import { ContextManager } from '@main/agent/runtime/context/ContextManager'
import { DefaultExecutableRequestAdapter } from '@main/agent/runtime/model/ExecutableRequestAdapter'
import { DefaultToolResultNormalizer } from '@main/agent/runtime/tools/result-normalization'
import { OpenAIAdapter } from '@main/request/adapters/openai/OpenAIAdapter'
import { mapChatContext } from '../ChatContextMapper'

vi.mock('@main/db/config', () => ({ configDb: {} }))
vi.mock('@main/request', () => ({ unifiedChatRequest: vi.fn() }))
vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

const createLoopIdentityProvider = (): LoopIdentityProvider => {
  let stepIndex = 0
  let recordIndex = 0
  let batchIndex = 0

  return {
    nextStepId: () => `step-${++stepIndex}`,
    nextTranscriptRecordId: () => `record-${++recordIndex}`,
    nextToolBatchId: () => `batch-${++batchIndex}`
  }
}

describe('mapChatContext', () => {
  it('replays a persisted literal Read view verbatim through normalization and the provider request', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'read-history-replay-'))
    try {
      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3vWQAAAABJRU5ErkJggg=='
      const text = `const image = "data:image/png;base64,${png}"\n${'\\'.repeat(29_000)}`
      const version = `sha256:${'a'.repeat(64)}`
      const modelContent = `[file_text]\nfile_version: ${version}\nnext_read: none\n[content]\n${text}`
      const rawContent = JSON.stringify({ success: true, content: text, file_version: version })
      const records = mapChatContext({
        messages: [
          {
            role: 'assistant', content: '', segments: [],
            toolCalls: [{ id: 'read-1', type: 'function', function: { name: 'read', arguments: '{"file_path":"sample.ts"}' } }]
          },
          {
            role: 'tool', name: 'read', toolCallId: 'read-1', segments: [],
            content: rawContent, toolResultModelContent: modelContent,
            toolResultModelContentKind: 'text'
          },
          { role: 'user', content: 'Continue editing this file.', segments: [] }
        ],
        now: 20,
        loopIdentityProvider: createLoopIdentityProvider()
      })
      const normalizer = new DefaultToolResultNormalizer({ workspaceRoot: root })
      const replay = records.map(record => record.kind === 'tool_result'
        ? {
          ...normalizer.normalize(record), recordId: record.recordId,
          kind: 'tool_result' as const, timestamp: record.timestamp
        }
        : record)
      const requestSpec = {
        adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'https://example.invalid',
        apiKey: 'test-key', model: 'test-model', contextWindowTokens: 1_000_000,
        contextCompression: false
      }
      const manager = new ContextManager(replay, requestSpec, { id: 'read-replay', timestamp: 20 })
      const request = new DefaultExecutableRequestAdapter().adapt(await manager.prepare())
      const body = new OpenAIAdapter().buildRequest(request)

      expect(rawContent.length).toBeGreaterThan(32_000)
      expect(modelContent.length).toBeLessThanOrEqual(32_000)
      expect(replay[1]).toMatchObject({ modelContentKind: 'text' })
      expect(replay[1].kind === 'tool_result' && replay[1].content).toBe(rawContent)
      expect(replay[1].kind === 'tool_result' && replay[1].modelContent).toBe(modelContent)
      expect(body.messages.find((message: BaseChatMessage) => message.role === 'tool')?.content).toBe(modelContent)
      expect(readdirSync(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('converts user string and VLM content to transcript parts', () => {
    const records = mapChatContext({
      messages: [
        {
          role: 'user',
          segments: [],
          content: 'hello',
          createdAt: 11
        },
        {
          role: 'user',
          segments: [],
          content: [
            { type: 'text', text: 'look' },
            {
              type: 'image_url',
              image_url: { url: 'file://image.png', detail: 'high' }
            },
            {
              type: 'image_url',
              image_url: { url: 'file://auto.png', detail: undefined! }
            }
          ]
        }
      ],
      now: 20,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records).toEqual([
      {
        recordId: 'record-1',
        kind: 'user',
        timestamp: 11,
        content: [{ type: 'input_text', text: 'hello' }]
      },
      {
        recordId: 'record-2',
        kind: 'user',
        timestamp: 20,
        content: [
          { type: 'input_text', text: 'look' },
          { type: 'input_image', imageUrl: 'file://image.png', detail: 'high' },
          { type: 'input_image', imageUrl: 'file://auto.png', detail: 'auto' }
        ]
      }
    ])
  })

  it('converts assistant reasoning and tool calls to assistant_step records', () => {
    const toolCall: IToolCall = {
      id: 'call-1',
      index: 2,
      type: 'function',
      function: {
        name: 'read',
        arguments: '{"path":"README.md"}'
      }
    }

    const records = mapChatContext({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'answer ' },
            {
              type: 'image_url',
              image_url: { url: 'file://ignored.png', detail: 'auto' }
            },
            { type: 'text', text: 'done' }
          ],
          model: 'model-1',
          toolCalls: [toolCall],
          segments: [
            {
              type: 'reasoning',
              segmentId: 'r',
              timestamp: 0,
              content: 'think again'
            }
          ],
          createdAt: 30
        },
        {
          role: 'assistant',
          segments: [],
          content: 'second',
          createdAt: 40
        }
      ],
      now: 50,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records).toEqual([
      {
        recordId: 'record-1',
        kind: 'assistant_step',
        timestamp: 30,
        step: {
          status: 'completed',
          stepId: 'step-1',
          stepIndex: 0,
          startedAt: 30,
          completedAt: 30,
          model: 'model-1',
          content: 'answer done',
          reasoning: 'think again',
          toolCalls: [toolCall],
          finishReason: undefined,
          usage: undefined
        }
      },
      {
        recordId: 'record-2',
        kind: 'assistant_step',
        timestamp: 40,
        step: {
          status: 'completed',
          stepId: 'step-2',
          stepIndex: 1,
          startedAt: 40,
          completedAt: 40,
          model: undefined,
          content: 'second',
          reasoning: undefined,
          toolCalls: [],
          finishReason: undefined,
          usage: undefined
        }
      }
    ])
  })

  it('matches tool results to the latest assistant step and projects content for history import', () => {
    const toolCall: IToolCall = {
      id: 'call-1',
      index: 3,
      type: 'function',
      function: {
        name: 'read',
        arguments: '{"path":"README.md"}'
      }
    }

    const records = mapChatContext({
      messages: [
        {
          role: 'assistant',
          segments: [],
          content: 'use tool',
          toolCalls: [toolCall],
          createdAt: 10
        },
        {
          role: 'tool',
          segments: [],
          toolCallId: 'call-1',
          toolResultModelContent: 'stable projection',
          content: [
            { type: 'text', text: 'result' },
            {
              type: 'image_url',
              image_url: { url: 'file://image.png', detail: 'auto' }
            }
          ],
          createdAt: 12
        }
      ],
      now: 20,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records[1]).toEqual({
      recordId: 'record-2',
      kind: 'tool_result',
      timestamp: 12,
      stepId: 'step-1',
      toolCallId: 'call-1',
      toolCallIndex: 3,
      toolName: 'read',
      status: 'success',
      modelContent: 'stable projection',
      content:
        '[{"type":"text","text":"result"},{"type":"image_url","image_url":{"url":"file://image.png","detail":"auto"}}]'
    })
  })

  it('returns empty records for empty transcript seed', () => {
    const records = mapChatContext({
      messages: [],
      now: 20,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records).toEqual([])
  })
})
