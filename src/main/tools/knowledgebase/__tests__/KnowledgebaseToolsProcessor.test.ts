import { beforeEach, describe, expect, it, vi } from 'vitest'

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn<(...args: any[]) => Promise<any[]>>()
}))

vi.mock('@main/services/knowledgebase/KnowledgebaseService', () => ({
  knowledgebaseService: {
    search: searchMock
  }
}))

import { processKnowledgebaseSearch } from '../KnowledgebaseToolsProcessor'

describe('KnowledgebaseToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns mapped search results with bounded top_k and threshold', async () => {
    searchMock
      .mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          filePath: '/workspace/docs/guide.md',
          fileName: 'guide.md',
          folderPath: '/workspace/docs',
          ext: '.md',
          text: 'retrieved snippet',
          chunkIndex: 2,
          score: 0.92,
          similarity: 0.87,
          charStart: 120,
          charEnd: 260,
          tokenEstimate: 35
        }
      ])
      .mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          filePath: '/workspace/docs/guide.md',
          fileName: 'guide.md',
          folderPath: '/workspace/docs',
          ext: '.md',
          text: 'retrieved snippet',
          chunkIndex: 2,
          score: 0.92,
          similarity: 0.87,
          charStart: 120,
          charEnd: 260,
          tokenEstimate: 35
        }
      ])

    const result = await processKnowledgebaseSearch({
      query: 'guide',
      localized_query: 'guide',
      top_k: 99,
      threshold: 2,
      folders: ['/workspace/docs'],
      extensions: ['.md']
    })

    expect(searchMock).toHaveBeenCalledTimes(2)
    expect(searchMock).toHaveBeenNthCalledWith(1, 'guide', {
      topK: 10,
      threshold: 1,
      folders: ['/workspace/docs'],
      extensions: ['.md']
    })
    expect(searchMock).toHaveBeenNthCalledWith(2, 'guide', {
      topK: 10,
      threshold: 1,
      folders: ['/workspace/docs'],
      extensions: ['.md']
    })
    expect(result).toEqual({
      success: true,
      query: 'guide',
      total_hits: 1,
      results: [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          file_path: '/workspace/docs/guide.md',
          file_name: 'guide.md',
          folder_path: '/workspace/docs',
          ext: '.md',
          text: 'retrieved snippet',
          chunk_index: 2,
          score: 0.92,
          similarity: 0.87,
          char_start: 120,
          char_end: 260,
          token_estimate: 35
        }
      ],
      message: 'Found 1 knowledgebase results.'
    })
  })

  it('fuses query and localized_query results with dedupe and ranking', async () => {
    searchMock
      .mockResolvedValueOnce([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          filePath: '/workspace/docs/guide.md',
          fileName: 'guide.md',
          folderPath: '/workspace/docs',
          ext: '.md',
          text: 'english snippet',
          chunkIndex: 2,
          score: 0.88,
          similarity: 0.84,
          charStart: 120,
          charEnd: 260,
          tokenEstimate: 35
        }
      ])
      .mockResolvedValueOnce([
        {
          chunkId: 'chunk-2',
          documentId: 'doc-2',
          filePath: '/workspace/docs/zh-guide.md',
          fileName: 'zh-guide.md',
          folderPath: '/workspace/docs',
          ext: '.md',
          text: '中文片段',
          chunkIndex: 1,
          score: 0.89,
          similarity: 0.85,
          charStart: 20,
          charEnd: 180,
          tokenEstimate: 42
        },
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          filePath: '/workspace/docs/guide.md',
          fileName: 'guide.md',
          folderPath: '/workspace/docs',
          ext: '.md',
          text: 'english snippet',
          chunkIndex: 2,
          score: 0.9,
          similarity: 0.86,
          charStart: 120,
          charEnd: 260,
          tokenEstimate: 35
        }
      ])

    const result = await processKnowledgebaseSearch({
      query: 'distributed lock',
      localized_query: '分布式锁',
      top_k: 5
    })

    expect(searchMock).toHaveBeenNthCalledWith(1, 'distributed lock', {
      topK: 5,
      threshold: undefined,
      folders: undefined,
      extensions: undefined
    })
    expect(searchMock).toHaveBeenNthCalledWith(2, '分布式锁', {
      topK: 5,
      threshold: undefined,
      folders: undefined,
      extensions: undefined
    })
    expect(result.success).toBe(true)
    expect(result.total_hits).toBe(2)
    expect(result.results.map(item => item.chunk_id)).toEqual(['chunk-1', 'chunk-2'])
    expect(result.results.map(item => item.score)).toEqual([0.9, 0.89])
  })

  it('returns an error payload when query is empty', async () => {
    const result = await processKnowledgebaseSearch({
      query: '   ',
      localized_query: '测试'
    })

    expect(searchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      query: '',
      total_hits: 0,
      results: [],
      message: 'query is required'
    })
  })

  it('returns an error payload when localized_query is empty', async () => {
    const result = await processKnowledgebaseSearch({
      query: 'guide',
      localized_query: '   '
    })

    expect(searchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      query: 'guide',
      total_hits: 0,
      results: [],
      message: 'localized_query is required'
    })
  })

  it('returns a no-hit success payload when search result is empty', async () => {
    searchMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await processKnowledgebaseSearch({
      query: 'missing topic',
      localized_query: '缺失主题'
    })

    expect(searchMock).toHaveBeenNthCalledWith(1, 'missing topic', {
      topK: 5,
      threshold: undefined,
      folders: undefined,
      extensions: undefined
    })
    expect(searchMock).toHaveBeenNthCalledWith(2, '缺失主题', {
      topK: 5,
      threshold: undefined,
      folders: undefined,
      extensions: undefined
    })
    expect(result.success).toBe(true)
    expect(result.total_hits).toBe(0)
    expect(result.message).toBe('No relevant knowledgebase results found.')
  })

  it('returns a failure payload when service throws', async () => {
    searchMock.mockRejectedValue(new Error('embedding unavailable'))

    const result = await processKnowledgebaseSearch({
      query: 'debug',
      localized_query: '调试'
    })

    expect(result).toEqual({
      success: false,
      query: 'debug',
      total_hits: 0,
      results: [],
      message: 'embedding unavailable'
    })
  })
})
