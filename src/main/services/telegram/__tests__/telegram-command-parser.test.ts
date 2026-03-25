import { describe, expect, it } from 'vitest'
import { parseTelegramCommand, parseTelegramCommandCallback } from '../telegram-command-parser'

describe('telegram-command-parser', () => {
  it('parses a plain command with args', () => {
    expect(parseTelegramCommand('/model gpt-4.1')).toEqual({
      name: 'model',
      args: 'gpt-4.1',
      raw: '/model gpt-4.1'
    })
  })

  it('parses a bot-targeted command for the current bot', () => {
    expect(parseTelegramCommand('/status@atiapp_bot', 'atiapp_bot')).toEqual({
      name: 'status',
      args: '',
      raw: '/status@atiapp_bot'
    })
  })

  it('ignores commands addressed to a different bot', () => {
    expect(parseTelegramCommand('/status@other_bot', 'atiapp_bot')).toBeNull()
  })

  it('ignores unknown commands', () => {
    expect(parseTelegramCommand('/unknown')).toBeNull()
  })

  it('parses callback data for paginated model and tool views', () => {
    expect(parseTelegramCommandCallback('tgcmd:models:2')).toEqual({
      type: 'models',
      page: 2
    })
    expect(parseTelegramCommandCallback('tgcmd:tools:0')).toEqual({
      type: 'tools',
      page: 0
    })
  })
})
