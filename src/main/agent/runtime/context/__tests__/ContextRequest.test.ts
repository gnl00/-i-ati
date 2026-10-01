import { projectContextRequest } from '../ContextRequest'
import { describe, expect, it } from 'vitest'
import type { ContextSnapshot } from '../ContextSnapshot'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

describe('projectContextRequest', () => {
  it('merges hidden request context into the following user protocol message', () => {
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'history-user',
          kind: 'user',
          timestamp: 1,
          content: [{ type: 'input_text', text: 'previous user' }]
        },
        {
          recordId: 'history-assistant',
          kind: 'assistant_step',
          timestamp: 1,
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            startedAt: 1,
            completedAt: 1,
            status: 'completed',
            content: 'previous answer',
            toolCalls: []
          }
        },
        {
          recordId: 'env-context',
          kind: 'user',
          timestamp: 2,
          source: MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT,
          content: [
            {
              type: 'input_text',
              text: '<system-environment>{"currentDate":"2026-06-26"}</system-environment>'
            }
          ]
        },
        {
          recordId: 'user-info-context',
          kind: 'user',
          timestamp: 2,
          source: MESSAGE_SOURCE.USER_INFO_CONTEXT,
          content: [
            {
              type: 'input_text',
              text: '<user_info_context>{"profile":{"name":"Gn"}}</user_info_context>'
            }
          ]
        },
        {
          recordId: 'awake-context',
          kind: 'user',
          timestamp: 2,
          source: MESSAGE_SOURCE.AWAKE_CONTEXT,
          content: [
            {
              type: 'input_text',
              text: '<awake_state>{"chat_meta":{"chat_id":1}}</awake_state>'
            }
          ]
        },
        {
          recordId: 'available-images-context',
          kind: 'user',
          timestamp: 2,
          source: MESSAGE_SOURCE.AVAILABLE_IMAGES_CONTEXT,
          content: [
            {
              type: 'input_text',
              text: '<available_images><image ref="message:101#image:1" /></available_images>'
            }
          ]
        },
        {
          recordId: 'current-user',
          kind: 'user',
          timestamp: 2,
          content: [{ type: 'input_text', text: 'current question' }]
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    expect(request.messages).toHaveLength(3)
    expect(request.messages[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'input_text', text: 'previous user' }]
    })
    expect(request.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'previous answer'
    })
    expect(request.messages[2]).toMatchObject({
      role: 'user'
    })

    const currentContent = request.messages[2].role === 'user' ? request.messages[2].content : []
    expect(currentContent[0]).toEqual({
      type: 'input_text',
      text: 'current question'
    })
    expect(currentContent[1]).toMatchObject({
      type: 'input_text',
      text: expect.stringContaining('<request_context>')
    })
    expect((currentContent[1] as { text: string }).text).toContain('<system-environment>')
    expect((currentContent[1] as { text: string }).text).toContain('<user_info_context>')
    expect((currentContent[1] as { text: string }).text).toContain('<awake_state>')
    expect((currentContent[1] as { text: string }).text).toContain('<available_images>')
  })

  it('preserves assistant reasoning for protocol replay', () => {
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'assistant-1',
          kind: 'assistant_step',
          timestamp: 2,
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            startedAt: 1,
            completedAt: 2,
            status: 'completed',
            content: 'answer',
            reasoning: 'thinking trace',
            toolCalls: []
          }
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    expect(request.messages).toEqual([
      {
        role: 'assistant',
        content: 'answer',
        reasoning: 'thinking trace',
        toolCalls: undefined
      }
    ])
  })

  it.each(['image_analyze', 'image_show'])('redacts %s image payloads from assistant tool call replay', (toolName) => {
    const visionArguments = JSON.stringify({
      chat_uuid: 'chat-runtime',
      images: [
        {
          ref: 'message:101#image:1',
          url: 'https://cdn.example/image.png?X-Amz-Signature=secret-token'
        },
        {
          raw_data: 'data:image/png;base64,raw-secret',
          file: 'screenshots/private.png'
        }
      ],
      url: 'https://cdn.example/legacy.png?token=legacy-token',
      urls: ['https://cdn.example/top-level.png?signed=top-level-token'],
      raw_data: ['data:image/jpeg;base64,legacy-secret'],
      files: ['screenshots/top-level-private.png'],
      prompt: 'inspect'
    })
    const nonVisionArguments = JSON.stringify({
      url: 'https://example.invalid/plain.png',
      raw_data: 'keep-this-non-vision-argument'
    })
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'assistant-1',
          kind: 'assistant_step',
          timestamp: 2,
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            startedAt: 1,
            completedAt: 2,
            status: 'completed',
            content: '',
            toolCalls: [
              {
                id: 'call-vision',
                type: 'function',
                function: {
                  name: toolName,
                  arguments: visionArguments
                }
              },
              {
                id: 'call-non-vision',
                type: 'function',
                function: {
                  name: 'debug_echo',
                  arguments: nonVisionArguments
                }
              }
            ]
          }
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    const serializedMessages = JSON.stringify(request.messages)
    expect(serializedMessages).not.toContain('data:image')
    expect(serializedMessages).not.toContain('secret-token')
    expect(serializedMessages).not.toContain('legacy-token')
    expect(serializedMessages).not.toContain('top-level-token')
    expect(serializedMessages).not.toContain('private.png')

    const assistantMessage = request.messages[0]
    expect(assistantMessage.role).toBe('assistant')
    if (assistantMessage.role !== 'assistant') {
      throw new Error('Expected assistant protocol message')
    }
    const [visionToolCall, nonVisionToolCall] = assistantMessage.toolCalls ?? []
    const redactedArguments = JSON.parse(visionToolCall.function.arguments)
    expect(redactedArguments).toMatchObject({
      chat_uuid: 'chat-runtime',
      images: [
        {
          ref: 'message:101#image:1',
          url: '[REDACTED]'
        },
        {
          raw_data: '[REDACTED]',
          file: '[REDACTED]'
        }
      ],
      url: '[REDACTED]',
      urls: ['[REDACTED]'],
      raw_data: ['[REDACTED]'],
      files: ['[REDACTED]'],
      prompt: 'inspect'
    })
    expect(nonVisionToolCall.function.arguments).toBe(nonVisionArguments)
  })

  it('redacts vision array arguments from assistant tool call replay', () => {
    const visionArguments = JSON.stringify([
      {
        ref: 'message:101#image:1',
        url: 'https://cdn.example/image.png?X-Amz-Signature=array-secret'
      },
      'data:image/png;base64,array-raw-secret',
      {
        urls: ['https://cdn.example/second.png?signature=second-secret'],
        raw_data: ['data:image/jpeg;base64,array-legacy-secret']
      }
    ])
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'assistant-1',
          kind: 'assistant_step',
          timestamp: 2,
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            startedAt: 1,
            completedAt: 2,
            status: 'completed',
            content: '',
            toolCalls: [
              {
                id: 'call-vision',
                type: 'function',
                function: {
                  name: 'image_analyze',
                  arguments: visionArguments
                }
              }
            ]
          }
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    const serializedMessages = JSON.stringify(request.messages)
    expect(serializedMessages).not.toContain('data:image')
    expect(serializedMessages).not.toContain('array-secret')
    expect(serializedMessages).not.toContain('second-secret')
    expect(serializedMessages).not.toContain('array-legacy-secret')

    const assistantMessage = request.messages[0]
    expect(assistantMessage.role).toBe('assistant')
    if (assistantMessage.role !== 'assistant') {
      throw new Error('Expected assistant protocol message')
    }
    const [visionToolCall] = assistantMessage.toolCalls ?? []
    expect(JSON.parse(visionToolCall.function.arguments)).toEqual([
      {
        ref: 'message:101#image:1',
        url: '[REDACTED]'
      },
      '[REDACTED]',
      {
        urls: ['[REDACTED]'],
        raw_data: ['[REDACTED]']
      }
    ])
  })

  it('redacts vision primitive string arguments from assistant tool call replay', () => {
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'assistant-1',
          kind: 'assistant_step',
          timestamp: 2,
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            startedAt: 1,
            completedAt: 2,
            status: 'completed',
            content: '',
            toolCalls: [
              {
                id: 'call-vision',
                type: 'function',
                function: {
                  name: 'image_analyze',
                  arguments: JSON.stringify('data:image/png;base64,primitive-secret')
                }
              }
            ]
          }
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    const serializedMessages = JSON.stringify(request.messages)
    expect(serializedMessages).not.toContain('data:image')
    expect(serializedMessages).not.toContain('primitive-secret')

    const assistantMessage = request.messages[0]
    expect(assistantMessage.role).toBe('assistant')
    if (assistantMessage.role !== 'assistant') {
      throw new Error('Expected assistant protocol message')
    }
    const [visionToolCall] = assistantMessage.toolCalls ?? []
    expect(JSON.parse(visionToolCall.function.arguments)).toBe('[REDACTED]')
  })

  it('strips raw image parts and preserves hidden vision observation text', () => {
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'current-user',
          kind: 'user',
          timestamp: 2,
          content: [
            {
              type: 'input_image',
              imageUrl: 'data:image/png;base64,abc',
              detail: 'auto'
            },
            { type: 'input_text', text: 'describe this' }
          ]
        },
        {
          recordId: 'vision-observation',
          kind: 'user',
          timestamp: 2,
          source: MESSAGE_SOURCE.VISION_OBSERVATION,
          content: [
            {
              type: 'input_text',
              text: '<vision_observation image_ref="message:101" status="ok">Summary: chart</vision_observation>'
            }
          ]
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    expect(request.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'describe this' }]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '<vision_observation image_ref="message:101" status="ok">Summary: chart</vision_observation>'
          }
        ]
      }
    ])
  })

  it('strips prior image parts while preserving observation and text follow-up context', () => {
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 4,
      records: [
        {
          recordId: 'image-user',
          kind: 'user',
          timestamp: 1,
          content: [
            {
              type: 'input_image',
              imageUrl: 'data:image/png;base64,abc',
              detail: 'auto'
            },
            { type: 'input_text', text: 'what is shown here?' }
          ]
        },
        {
          recordId: 'vision-observation',
          kind: 'user',
          timestamp: 1,
          source: MESSAGE_SOURCE.VISION_OBSERVATION,
          content: [
            {
              type: 'input_text',
              text: '<vision_observation image_ref="message:101" status="ok">Summary: invoice screenshot</vision_observation>'
            }
          ]
        },
        {
          recordId: 'assistant-reply',
          kind: 'assistant_step',
          timestamp: 2,
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            startedAt: 2,
            completedAt: 3,
            status: 'completed',
            content: 'It shows an invoice.',
            toolCalls: []
          }
        },
        {
          recordId: 'follow-up',
          kind: 'user',
          timestamp: 4,
          content: [{ type: 'input_text', text: 'extract the total only' }]
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    const serializedMessages = JSON.stringify(request.messages)
    expect(serializedMessages).not.toContain('input_image')
    expect(serializedMessages).toContain('what is shown here?')
    expect(serializedMessages).toContain('Summary: invoice screenshot')
    expect(serializedMessages).toContain('It shows an invoice.')
    expect(serializedMessages).toContain('extract the total only')
    expect(request.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'what is shown here?' }]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '<vision_observation image_ref="message:101" status="ok">Summary: invoice screenshot</vision_observation>'
          }
        ]
      },
      {
        role: 'assistant',
        content: 'It shows an invoice.',
        reasoning: undefined,
        toolCalls: undefined
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'extract the total only' }]
      }
    ])
  })

  it('replays prepared media content without further truncation', () => {
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'tool-1',
          kind: 'tool_result',
          timestamp: 2,
          stepId: 'step-1',
          toolCallId: 'call-1',
          toolCallIndex: 0,
          toolName: 'vision_tool',
          status: 'success',
          content: `{"image":"data:image/png;base64,${'a'.repeat(200)}"}`,
          modelContent: 'image artifact: .ati/artifacts/tools/test/image-1.png'
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    expect(request.messages[0]).toMatchObject({
      role: 'tool',
      content: 'image artifact: .ati/artifacts/tools/test/image-1.png',
      toolCallId: 'call-1',
      toolName: 'vision_tool'
    })
    expect((request.messages[0] as { content: string }).content).not.toContain(
      'data:image/png;base64'
    )
  })

  it('preserves prepared tool results during active run replay', () => {
    const largeContent = JSON.stringify({
      nodes: 'x'.repeat(40_000),
      image: `data:image/png;base64,${'a'.repeat(200)}`
    })
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'tool-1',
          kind: 'tool_result',
          timestamp: 2,
          stepId: 'step-1',
          toolCallId: 'call-1',
          toolCallIndex: 0,
          toolName: 'computer_use_state',
          status: 'success',
          content: largeContent
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    expect(request.messages[0]).toMatchObject({
      role: 'tool',
      content: largeContent,
      toolCallId: 'call-1',
      toolName: 'computer_use_state'
    })
  })

  it('preserves stable model content after a following assistant step', () => {
    const representation = JSON.stringify({
      compacted: true,
      lossy: true,
      result: { summary: 'x'.repeat(5_000) }
    })
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 3,
      records: [
        {
          recordId: 'tool-1',
          kind: 'tool_result',
          timestamp: 2,
          stepId: 'step-1',
          toolCallId: 'call-1',
          toolCallIndex: 0,
          toolName: 'web_fetch',
          status: 'success',
          content: representation,
          modelContent: representation
        },
        {
          recordId: 'assistant-1',
          kind: 'assistant_step',
          timestamp: 3,
          step: {
            stepId: 'step-2',
            stepIndex: 1,
            startedAt: 3,
            completedAt: 3,
            status: 'completed',
            content: 'used compact evidence',
            toolCalls: []
          }
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    expect(request.messages[0]).toMatchObject({
      role: 'tool',
      content: representation
    })
    expect(JSON.parse((request.messages[0] as { content: string }).content)).toEqual({
      compacted: true,
      lossy: true,
      result: { summary: 'x'.repeat(5_000) }
    })
  })

  it('uses the prepared model content', () => {
    const representation = JSON.stringify({
      compacted: true,
      lossy: true,
      result: { summary: 'x'.repeat(5_000) }
    })
    const transcript: ContextSnapshot = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'tool-1',
          kind: 'tool_result',
          timestamp: 2,
          stepId: 'step-1',
          toolCallId: 'call-1',
          toolCallIndex: 0,
          toolName: 'web_fetch',
          status: 'success',
          content: representation,
          modelContent: representation
        }
      ]
    }

    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    expect(request.messages[0]).toMatchObject({
      role: 'tool',
      content: representation
    })
  })

  it('preserves earlier tool evidence after another assistant step', () => {
    const content = 'test failure detail '.repeat(1_000)
    const record = {
      kind: 'tool_result' as const,
      recordId: 'r1',
      timestamp: 1,
      stepId: 's1',
      toolCallId: 'c1',
      toolCallIndex: 0,
      toolName: 'exec',
      status: 'success' as const,
      content,
      modelContent: content
    }
    const transcript: ContextSnapshot = {
      transcriptId: 't1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        record,
        {
          kind: 'assistant_step',
          recordId: 'r2',
          timestamp: 2,
          step: {
            stepId: 's2',
            stepIndex: 1,
            startedAt: 2,
            completedAt: 2,
            status: 'completed',
            content: 'inspect source next',
            toolCalls: []
          }
        }
      ]
    }
    const request = projectContextRequest({
      records: transcript.records,
      requestSpec: {
        adapterPluginId: 'test',
        baseUrl: '',
        apiKey: '',
        model: 'test'
      }
    })
    expect(request.messages[0].content).toBe(content)
    expect(record.modelContent).toBe(content)
  })
})
