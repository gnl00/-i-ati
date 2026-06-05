import { describe, expect, it } from 'vitest'
import { createTestUnifiedRequest } from '../../__tests__/helpers'
import { RequestPayloadExtensionPipeline } from '../RequestPayloadExtensionPipeline'

describe('RequestPayloadExtensionPipeline', () => {
  it('applies DeepSeek thinking fields from the selected payload extension', () => {
    const body: Record<string, unknown> = {}

    new RequestPayloadExtensionPipeline().apply({
      body,
      request: createTestUnifiedRequest({
        payloadExtensions: {
          thinking: 'deepseek-thinking'
        },
        options: {
          thinking: {
            enabled: true,
            effort: 'max'
          }
        }
      })
    })

    expect(body).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max'
    })
  })

  it('disables DeepSeek thinking and clears stale reasoning_effort', () => {
    const body: Record<string, unknown> = {
      reasoning_effort: 'high'
    }

    new RequestPayloadExtensionPipeline().apply({
      body,
      request: createTestUnifiedRequest({
        payloadExtensions: {
          thinking: 'deepseek-thinking'
        },
        options: {
          thinking: {
            enabled: false
          }
        }
      })
    })

    expect(body).toEqual({
      thinking: { type: 'disabled' }
    })
  })

  it('skips DeepSeek reasoning_effort when the selected effort is outside the patch allowlist', () => {
    const body: Record<string, unknown> = {}

    new RequestPayloadExtensionPipeline().apply({
      body,
      request: createTestUnifiedRequest({
        payloadExtensions: {
          thinking: 'deepseek-thinking'
        },
        options: {
          thinking: {
            enabled: true,
            effort: 'none'
          }
        }
      })
    })

    expect(body).toEqual({
      thinking: { type: 'enabled' }
    })
  })

  it('applies Xiaomi thinking.type from the selected payload extension', () => {
    const body: Record<string, unknown> = {
      thinking: {
        budget: 1024
      }
    }

    new RequestPayloadExtensionPipeline().apply({
      body,
      request: createTestUnifiedRequest({
        payloadExtensions: {
          thinking: 'xiaomi-thinking'
        },
        options: {
          thinking: {
            enabled: true,
            effort: 'enabled'
          }
        }
      })
    })

    expect(body).toEqual({
      thinking: {
        budget: 1024,
        type: 'enabled'
      }
    })
  })

  it('applies Doubao thinking.type from the selected payload extension', () => {
    const body: Record<string, unknown> = {}

    new RequestPayloadExtensionPipeline().apply({
      body,
      request: createTestUnifiedRequest({
        payloadExtensions: {
          thinking: 'doubao-thinking'
        },
        options: {
          thinking: {
            enabled: false
          }
        }
      })
    })

    expect(body).toEqual({
      thinking: { type: 'disabled' }
    })
  })

  it('leaves the body unchanged without a selected payload extension', () => {
    const body: Record<string, unknown> = {}

    new RequestPayloadExtensionPipeline().apply({
      body,
      request: createTestUnifiedRequest({
        options: {
          thinking: {
            enabled: true,
            effort: 'high'
          }
        }
      })
    })

    expect(body).toEqual({})
  })
})
