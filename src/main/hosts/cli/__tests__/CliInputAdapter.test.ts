import { describe, expect, it } from 'vitest'
import {
  CLI_MAX_TIMEOUT_SECONDS,
  CliInputError,
  parseCliArguments,
  parseCliModelConfig
} from '../CliInputAdapter'

const validArgs = [
  'run',
  '--instruction-file', 'instruction.md',
  '--workspace', '/tmp/workspace',
  '--config', 'model.json',
  '--output-dir', '/tmp/output'
]

describe('parseCliArguments', () => {
  it('parses a single run and applies bounded defaults', () => {
    const result = parseCliArguments(validArgs)

    expect(result).toEqual({
      kind: 'run',
      options: {
        instructionFile: 'instruction.md',
        workspace: '/tmp/workspace',
        config: 'model.json',
        outputDir: '/tmp/output',
        timeoutSeconds: 900,
        maxSteps: 80,
        approval: 'deny'
      }
    })
  })

  it('supports inline values and explicit approvals', () => {
    const result = parseCliArguments([
      'run',
      '--instruction-file=instruction.md',
      '--workspace=/tmp/workspace',
      '--config=model.json',
      '--output-dir=/tmp/output',
      '--timeout-seconds=2',
      '--max-steps=3',
      '--approval=auto',
      '--profile-dir=/tmp/cli-profile'
    ])

    expect(result.kind).toBe('run')
    if (result.kind === 'run') {
      expect(result.options.timeoutSeconds).toBe(2)
      expect(result.options.maxSteps).toBe(3)
      expect(result.options.approval).toBe('auto')
      expect(result.options.profileDir).toBe('/tmp/cli-profile')
    }
  })

  it('returns help before validating run arguments', () => {
    expect(parseCliArguments(['--help'])).toEqual({ kind: 'help' })
    expect(parseCliArguments(['run', '--help'])).toEqual({ kind: 'help' })
  })

  it.each([
    ['unknown option', [...validArgs, '--unknown', 'x']],
    ['duplicate option', [...validArgs, '--workspace', '/tmp/other']],
    ['missing value', [...validArgs, '--approval']],
    ['zero step budget', [...validArgs, '--max-steps', '0']],
    ['invalid approval', [...validArgs, '--approval', 'prompt']],
    ['timer overflow', [...validArgs, '--timeout-seconds', String(CLI_MAX_TIMEOUT_SECONDS + 1)]]
  ])('rejects %s', (_label, argv) => {
    expect(() => parseCliArguments(argv)).toThrow(CliInputError)
  })
})

describe('parseCliModelConfig', () => {
  it('validates a built-in agent adapter and reads only the named key', () => {
    const result = parseCliModelConfig(JSON.stringify({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'http://127.0.0.1:4312/v1/',
      model: 'local-test',
      apiKeyEnv: 'TEST_MODEL_KEY',
      systemPrompt: 'Use the workspace.',
      options: { thinking: { enabled: true, effort: 'high' } },
      requestOverrides: { temperature: 0, usage: { promptTokens: 2 } }
    }), {
      TEST_MODEL_KEY: 'secret-key',
      OTHER_KEY: 'ignored'
    })

    expect(result).toMatchObject({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'http://127.0.0.1:4312/v1',
      model: 'local-test',
      apiKeyEnv: 'TEST_MODEL_KEY',
      apiKey: 'secret-key'
    })
    expect(result.options).toEqual({
      thinking: {
        enabled: true,
        effort: 'high'
      }
    })
    expect(result.requestOverrides).toEqual({ temperature: 0, usage: { promptTokens: 2 } })
  })

  it('accepts explicit disabled thinking while preserving the normalized option shape', () => {
    const result = parseCliModelConfig(JSON.stringify({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'http://localhost/v1',
      model: 'local-test',
      apiKeyEnv: 'KEY',
      options: { thinking: { enabled: false } }
    }), { KEY: 'secret-key' })

    expect(result.options).toEqual({ thinking: { enabled: false } })
  })

  it('keeps omitted options undefined', () => {
    const result = parseCliModelConfig(JSON.stringify({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'http://localhost/v1',
      model: 'local-test',
      apiKeyEnv: 'KEY'
    }), { KEY: 'secret-key' })

    expect(result.options).toBeUndefined()
  })

  it.each([
    ['invalid JSON', '{'],
    ['image-only adapter', JSON.stringify({ adapterPluginId: 'openai-image-compatible-adapter', baseUrl: 'http://localhost', model: 'image', apiKeyEnv: 'KEY' })],
    ['embedded URL credentials', JSON.stringify({ adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://user:pass@localhost', model: 'chat', apiKeyEnv: 'KEY' })],
    ['missing API key', JSON.stringify({ adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://localhost', model: 'chat', apiKeyEnv: 'KEY' }), { KEY: '' }],
    ['protected API key environment', JSON.stringify({ adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://localhost', model: 'chat', apiKeyEnv: 'PATH' })],
    ['options with unknown field', JSON.stringify({ adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://localhost', model: 'chat', apiKeyEnv: 'KEY', options: { temperature: 0 } })],
    ['thinking with unknown field', JSON.stringify({ adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://localhost', model: 'chat', apiKeyEnv: 'KEY', options: { thinking: { enabled: true, level: 'high' } } })],
    ['thinking without enabled', JSON.stringify({ adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://localhost', model: 'chat', apiKeyEnv: 'KEY', options: { thinking: { effort: 'high' } } })],
    ['thinking with invalid enabled', JSON.stringify({ adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://localhost', model: 'chat', apiKeyEnv: 'KEY', options: { thinking: { enabled: 'true' } } })],
    ['thinking with empty effort', JSON.stringify({ adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'http://localhost', model: 'chat', apiKeyEnv: 'KEY', options: { thinking: { enabled: true, effort: ' ' } } })]
  ])('rejects %s', (_label, rawConfig, environment = { KEY: 'value' }) => {
    expect(() => parseCliModelConfig(rawConfig, environment)).toThrow(CliInputError)
  })
})
