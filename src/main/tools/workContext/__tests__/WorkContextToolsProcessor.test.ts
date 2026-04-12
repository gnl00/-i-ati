import { beforeEach, describe, expect, it, vi } from 'vitest'

const WORK_CONTEXT_TEMPLATE = `# Work Context

## Current Goal

## Decisions

## In Progress

## Open Questions

## Temporary Constraints

## Last Updated
`

const {
  getChatByUuidMock,
  getWorkContextByChatUuidMock,
  upsertWorkContextMock
} = vi.hoisted(() => ({
  getChatByUuidMock: vi.fn(),
  getWorkContextByChatUuidMock: vi.fn(),
  upsertWorkContextMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatByUuid: getChatByUuidMock,
    getWorkContextByChatUuid: getWorkContextByChatUuidMock,
    upsertWorkContext: upsertWorkContextMock
  }
}))

import { processWorkContextGet, processWorkContextSet } from '../WorkContextToolsProcessor'

describe('WorkContextToolsProcessor', () => {
  const chatUuid = 'c06fa90a-436c-46fb-84ff-3d2532cacec1'
  const chatEntity = {
    id: 12,
    uuid: chatUuid,
    title: 'NewChat',
    messages: [],
    updateTime: 1,
    createTime: 1
  } as ChatEntity

  beforeEach(() => {
    getChatByUuidMock.mockReset()
    getWorkContextByChatUuidMock.mockReset()
    upsertWorkContextMock.mockReset()
  })

  it('returns template when work context does not exist', async () => {
    getWorkContextByChatUuidMock.mockReturnValue(undefined)

    const res = await processWorkContextGet({ chat_uuid: chatUuid })

    expect(res.success).toBe(true)
    expect(res.exists).toBe(false)
    expect(res.content).toBe(WORK_CONTEXT_TEMPLATE)
  })

  it('returns template content when chat_uuid is missing', async () => {
    const res = await processWorkContextGet({})

    expect(res.success).toBe(false)
    expect(res.exists).toBe(false)
    expect(res.content).toBe(WORK_CONTEXT_TEMPLATE)
    expect(res.message).toContain('chat_uuid is required')
  })

  it('writes and reads work context markdown through DatabaseService', async () => {
    const content = [
      '# Work Context',
      '',
      '## Current Goal',
      'Ship schedule stability fix.',
      '',
      '## Decisions',
      '- Use single subscription per submission.'
    ].join('\n')

    getChatByUuidMock.mockReturnValue(chatEntity)
    getWorkContextByChatUuidMock.mockReturnValueOnce(undefined)
    upsertWorkContextMock.mockImplementation((chatId: number, uuid: string, nextContent: string) => ({
      chatId,
      chatUuid: uuid,
      content: nextContent,
      createdAt: 1,
      updatedAt: 2
    }))
    getWorkContextByChatUuidMock.mockReturnValueOnce({
      chatId: chatEntity.id,
      chatUuid,
      content: `${content}\n`,
      createdAt: 1,
      updatedAt: 2
    })

    const setRes = await processWorkContextSet({
      chat_uuid: chatUuid,
      content
    })

    expect(setRes.success).toBe(true)
    expect(setRes.updated).toBe(true)
    expect(setRes.skipped).toBe(false)
    expect(upsertWorkContextMock).toHaveBeenCalledWith(chatEntity.id, chatUuid, `${content}\n`)

    const getRes = await processWorkContextGet({ chat_uuid: chatUuid })
    expect(getRes.success).toBe(true)
    expect(getRes.exists).toBe(true)
    expect(getRes.content).toContain('Ship schedule stability fix.')
  })

  it('skips writing when normalized content is unchanged', async () => {
    getChatByUuidMock.mockReturnValue(chatEntity)
    getWorkContextByChatUuidMock.mockReturnValue({
      chatId: chatEntity.id,
      chatUuid,
      content: '# Work Context\n\n## Current Goal\nStabilize streaming.\n',
      createdAt: 1,
      updatedAt: 1
    })

    const sameWithFormattingNoise = '# Work Context\r\n\r\n## Current Goal\r\nStabilize streaming.   \r\n\r\n'
    const res = await processWorkContextSet({
      chat_uuid: chatUuid,
      content: sameWithFormattingNoise
    })

    expect(res.success).toBe(true)
    expect(res.updated).toBe(false)
    expect(res.skipped).toBe(true)
    expect(upsertWorkContextMock).not.toHaveBeenCalled()
  })

  it('writes template when content is empty', async () => {
    getChatByUuidMock.mockReturnValue(chatEntity)
    getWorkContextByChatUuidMock.mockReturnValue(undefined)

    const res = await processWorkContextSet({
      chat_uuid: chatUuid,
      content: '   \n\n  '
    })

    expect(res.success).toBe(true)
    expect(res.updated).toBe(true)
    expect(res.skipped).toBe(false)
    expect(upsertWorkContextMock).toHaveBeenCalledWith(chatEntity.id, chatUuid, `${WORK_CONTEXT_TEMPLATE.trimEnd()}\n`)
  })

  it('returns validation message when content type is invalid', async () => {
    const res = await processWorkContextSet({
      chat_uuid: chatUuid,
      content: 123 as any
    })

    expect(res.success).toBe(false)
    expect(res.message).toContain('invalid param type: content')
  })

  it('returns missing required param error when content is absent', async () => {
    const res = await processWorkContextSet({
      chat_uuid: chatUuid
    } as any)

    expect(res.success).toBe(false)
    expect(res.message).toBe('missing required param: content')
  })

  it('returns error when chat_uuid is not found', async () => {
    getChatByUuidMock.mockReturnValue(undefined)

    const res = await processWorkContextSet({
      chat_uuid: chatUuid,
      content: '# Work Context'
    })

    expect(res.success).toBe(false)
    expect(res.message).toContain('chat_uuid not found')
  })
})
