import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { KnowledgebaseContextProvider } from '../KnowledgebaseContextProvider'

const { knowledgebaseSearchMock } = vi.hoisted(() => ({
  knowledgebaseSearchMock: vi.fn<(...args: any[]) => Promise<any[]>>(async () => [])
}))

vi.mock('@main/hosts/chat/config/AppConfigStore', () => ({
  AppConfigStore: class AppConfigStore {
    getConfig(): IAppConfig | null {
      return null
    }
  }
}))

vi.mock('@main/services/knowledgebase/KnowledgebaseService', () => ({
  knowledgebaseService: {
    search: knowledgebaseSearchMock
  }
}))

function createProvider(knowledgebase: Partial<NonNullable<IAppConfig['knowledgebase']>>): KnowledgebaseContextProvider {
  return new KnowledgebaseContextProvider({
    getConfig: () => ({
      knowledgebase: {
        enabled: true,
        folders: ['/workspace/docs'],
        maxResults: 4,
        retrievalMode: 'tool-first',
        ...knowledgebase
      }
    })
  } as any)
}

describe('KnowledgebaseContextProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    knowledgebaseSearchMock.mockResolvedValue([])
  })

  it('returns null when knowledgebase is disabled', async () => {
    const provider = createProvider({ enabled: false })

    await expect(provider.build('hello')).resolves.toBeNull()
  })

  it('builds a tool-first policy hidden user message', async () => {
    const provider = createProvider({ retrievalMode: 'tool-first' })

    const message = await provider.build('hello')

    expect(knowledgebaseSearchMock).not.toHaveBeenCalled()
    expect(message).toEqual(expect.objectContaining({
      role: 'user',
      source: MESSAGE_SOURCE.KNOWLEDGEBASE_CONTEXT,
      segments: []
    }))
    expect(message?.content).toContain('<knowledgebase_policy>')
    expect(message?.content).toContain('knowledgebase_search')
  })

  it('builds retrieved context hidden user message in auto mode', async () => {
    knowledgebaseSearchMock.mockResolvedValueOnce([
      {
        filePath: '/workspace/docs/guide.md',
        text: 'Knowledge base snippet.',
        score: 0.91,
        similarity: 0.88,
        chunkIndex: 0,
        charStart: 0,
        charEnd: 23
      }
    ])
    const provider = createProvider({ retrievalMode: 'auto' })

    const message = await provider.build('hello')

    expect(knowledgebaseSearchMock).toHaveBeenCalledWith('hello', expect.objectContaining({
      topK: 4,
      threshold: 0.42,
      folders: ['/workspace/docs']
    }))
    expect(message?.source).toBe(MESSAGE_SOURCE.KNOWLEDGEBASE_CONTEXT)
    expect(message?.content).toContain('<knowledgebase_context>')
    expect(message?.content).toContain('/workspace/docs/guide.md')
    expect(message?.content).toContain('Knowledge base snippet.')
  })

  it('returns null in auto mode when retrieval has no results', async () => {
    knowledgebaseSearchMock.mockResolvedValueOnce([])
    const provider = createProvider({ retrievalMode: 'auto' })

    await expect(provider.build('hello')).resolves.toBeNull()
  })
})
