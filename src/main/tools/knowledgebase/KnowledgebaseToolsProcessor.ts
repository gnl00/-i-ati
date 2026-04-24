import { knowledgebaseService } from '@main/services/knowledgebase/KnowledgebaseService'
import type {
  KnowledgebaseSearchArgs,
  KnowledgebaseSearchResponse
} from '@tools/knowledgebase/index.d'

type SearchResultItem = Awaited<ReturnType<typeof knowledgebaseService.search>>[number]

function normalizeQueryCandidate(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function mergeSearchResults(resultSets: SearchResultItem[][], topK: number): SearchResultItem[] {
  const byChunkId = new Map<string, SearchResultItem>()

  resultSets.forEach((results) => {
    results.forEach((item) => {
      const existing = byChunkId.get(item.chunkId)

      if (!existing) {
        byChunkId.set(item.chunkId, {
          ...item,
          score: Number(item.score.toFixed(4)),
          similarity: Number(item.similarity.toFixed(4))
        })
        return
      }

      if (item.score > existing.score) {
        byChunkId.set(item.chunkId, {
          ...item,
          score: Number(item.score.toFixed(4)),
          similarity: Number(item.similarity.toFixed(4))
        })
        return
      }

      byChunkId.set(item.chunkId, {
        ...existing,
        score: Number(Math.max(existing.score, item.score).toFixed(4)),
        similarity: Number(Math.max(existing.similarity, item.similarity).toFixed(4))
      })
    })
  })

  return Array.from(byChunkId.values())
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      if (b.similarity !== a.similarity) {
        return b.similarity - a.similarity
      }
      return a.chunkIndex - b.chunkIndex
    })
    .slice(0, topK)
}

export async function processKnowledgebaseSearch(
  args: KnowledgebaseSearchArgs
): Promise<KnowledgebaseSearchResponse> {
  try {
    const query = normalizeQueryCandidate(args.query)
    if (!query) {
      return {
        success: false,
        query: '',
        total_hits: 0,
        results: [],
        message: 'query is required'
      }
    }

    const localizedQuery = normalizeQueryCandidate(args.localized_query)
    if (!localizedQuery) {
      return {
        success: false,
        query,
        total_hits: 0,
        results: [],
        message: 'localized_query is required'
      }
    }

    const topK = Math.min(Math.max(Math.floor(args.top_k ?? 5), 1), 10)
    const threshold = typeof args.threshold === 'number'
      ? Math.min(Math.max(args.threshold, 0), 1)
      : undefined

    const resultSets = await Promise.all(
      [query, localizedQuery].map((candidate) => knowledgebaseService.search(candidate, {
        topK,
        threshold,
        folders: args.folders,
        extensions: args.extensions
      }))
    )

    const results = mergeSearchResults(resultSets, topK)

    return {
      success: true,
      query,
      total_hits: results.length,
      results: results.map(item => ({
        chunk_id: item.chunkId,
        document_id: item.documentId,
        file_path: item.filePath,
        file_name: item.fileName,
        folder_path: item.folderPath,
        ext: item.ext,
        text: item.text,
        chunk_index: item.chunkIndex,
        score: item.score,
        similarity: item.similarity,
        char_start: item.charStart,
        char_end: item.charEnd,
        token_estimate: item.tokenEstimate
      })),
      message: results.length > 0
        ? `Found ${results.length} knowledgebase results.`
        : 'No relevant knowledgebase results found.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      query: args.query ?? '',
      total_hits: 0,
      results: [],
      message
    }
  }
}
