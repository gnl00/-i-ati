import { describe, expect, it, vi } from 'vitest'
import { GeminiAdapter } from '../gemini'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { createTestUnifiedRequest } from '../../__tests__/helpers'

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: vi.fn(() => ({ tools: {} }))
  }
}))

const toDataChunk = (payload: Record<string, any>): string => `data: ${JSON.stringify(payload)}`

describe('GeminiAdapter request mapping', () => {
  it('serializes image_url parts into Gemini image parts', () => {
    const adapter = new GeminiAdapter()

    const request = createTestUnifiedRequest({
      adapterPluginId: 'google-gemini-compatible-adapter',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/jpeg;base64,abc123',
              detail: 'auto'
            }
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://cdn.example/image.png',
              detail: 'high'
            }
          },
          {
            type: 'text',
            text: 'Describe these images.'
          }
        ]
      }]
    })

    const requestBody = adapter.buildRequest(request)

    expect(requestBody.contents).toEqual([{
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: 'abc123'
          }
        },
        {
          fileData: {
            mimeType: 'image/png',
            fileUri: 'https://cdn.example/image.png'
          }
        },
        {
          text: 'Describe these images.'
        }
      ]
    }])
  })

  it('maps unified input to Gemini GenerateContent format', () => {
    const adapter = new GeminiAdapter()

    const request = createTestUnifiedRequest({
      adapterPluginId: 'google-gemini-compatible-adapter',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.5-flash',
      stream: true,
      systemPrompt: 'You are concise.',
      messages: [
        {
          role: 'user',
          content: 'hello'
        },
        {
          role: 'assistant',
          content: 'calling tool',
          toolCalls: [{
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"weather"}'
            }
          }]
        },
        {
          role: 'tool',
          content: '{"temperature":21}',
          toolCallId: 'call-1',
          toolName: 'search'
        }
      ],
      options: {
        maxTokens: 512,
        thinking: {
          enabled: true,
          effort: 'high'
        }
      }
    })

    const requestBody = adapter.buildRequest(request)

    expect(adapter.getEndpoint(request.baseUrl, request)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse'
    )
    expect(requestBody.systemInstruction).toEqual({
      parts: [{ text: 'You are concise.' }]
    })
    expect(requestBody.generationConfig).toEqual({
      maxOutputTokens: 512,
      thinkingConfig: { thinkingLevel: 'high' }
    })
    expect(requestBody.contents).toEqual([
      {
        role: 'user',
        parts: [{ text: 'hello' }]
      },
      {
        role: 'model',
        parts: [
          { text: 'calling tool' },
          {
            functionCall: {
              name: 'search',
              args: { query: 'weather' }
            }
          }
        ]
      },
      {
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'search',
            response: { temperature: 21 }
          }
        }]
      }
    ])
  })

  it('uses non-stream GenerateContent endpoint when stream is disabled', () => {
    const adapter = new GeminiAdapter()
    const request = createTestUnifiedRequest({
      adapterPluginId: 'google-gemini-compatible-adapter',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'models/gemini-2.5-pro',
      stream: false
    })

    expect(adapter.getEndpoint(request.baseUrl, request)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
    )
  })

  it('requires tool_call_reason in Gemini function declarations', () => {
    const adapter = new GeminiAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'google-gemini-compatible-adapter',
      tools: [{
        name: 'search',
        description: 'Search',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      }]
    }))

    const parameters = requestBody.tools[0].functionDeclarations[0].parameters
    expect(parameters.properties[TOOL_CALL_REASON_PARAMETER_NAME]).toEqual(expect.objectContaining({
      type: 'string'
    }))
    expect(parameters.required).toEqual(['query', TOOL_CALL_REASON_PARAMETER_NAME])
  })
})

describe('GeminiAdapter response parsing', () => {
  it('parses non-stream text, tool calls, finish reason, and usage', () => {
    const adapter = new GeminiAdapter()

    const response = adapter.parseResponse({
      responseId: 'gemini-1',
      modelVersion: 'gemini-2.5-flash',
      candidates: [{
        finishReason: 'FUNCTION_CALL',
        content: {
          parts: [
            { text: 'hello' },
            { functionCall: { name: 'search', args: { query: 'weather' } } }
          ]
        }
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 4,
        totalTokenCount: 14
      }
    })

    expect(response).toEqual(expect.objectContaining({
      id: 'gemini-1',
      model: 'gemini-2.5-flash',
      content: 'hello',
      finishReason: 'tool_calls',
      usage: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14
      }
    }))
    expect(response.toolCalls?.[0]?.function).toEqual({
      name: 'search',
      arguments: '{"query":"weather"}'
    })
  })

  it('parses stream chunks', () => {
    const adapter = new GeminiAdapter()

    const chunk = adapter.parseStreamResponse(toDataChunk({
      responseId: 'gemini-stream-1',
      modelVersion: 'gemini-2.5-flash',
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{ text: 'hello' }]
        }
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 4,
        totalTokenCount: 14
      }
    }))

    expect(chunk?.delta?.content).toBe('hello')
    expect(chunk?.delta?.finishReason).toBe('stop')
    expect(chunk?.usage).toEqual({
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14
    })
  })
})
