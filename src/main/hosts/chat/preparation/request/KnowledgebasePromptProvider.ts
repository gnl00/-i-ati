import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import { knowledgebaseService } from '@main/services/knowledgebase/KnowledgebaseService'

const AUTO_RAG_TOP_K = 4
const AUTO_RAG_THRESHOLD = 0.42
const AUTO_RAG_SNIPPET_LIMIT = 720

function trimSnippet(text: string, limit = AUTO_RAG_SNIPPET_LIMIT): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) {
    return normalized
  }
  return `${normalized.slice(0, limit).trim()}...`
}

export class KnowledgebasePromptProvider {
  constructor(
    private readonly appConfigStore = new AppConfigStore()
  ) {}

  async build(query?: string): Promise<string> {
    const config = this.appConfigStore.getConfig()?.knowledgebase
    if (!(config?.enabled ?? false) || (config?.folders?.length ?? 0) === 0) {
      return ''
    }

    const retrievalMode = config?.retrievalMode ?? 'tool-first'
    if (retrievalMode === 'off') {
      return ''
    }

    if (retrievalMode === 'tool-first') {
      return [
        '<knowledgebase_policy>',
        '## [P1] Knowledgebase Retrieval Policy',
        'A local knowledge base is available through the knowledgebase_search tool.',
        'Call knowledgebase_search when the user asks about local docs, project code, implementation details, local notes, repository files, or knowledge stored in configured folders.',
        'For every knowledgebase_search call, always pass both query and localized_query.',
        'localized_query must express the same intent in the current conversation language.',
        'In cross-language retrieval, keep query and localized_query semantically aligned and let localized_query match the current user language.',
        'When tool results support the answer, cite the file path you relied on.',
        '</knowledgebase_policy>'
      ].join('\n')
    }

    const trimmedQuery = query?.trim()
    if (!trimmedQuery || trimmedQuery.length < 3) {
      return ''
    }

    const topK = Math.min(Math.max(config?.maxResults ?? AUTO_RAG_TOP_K, 1), AUTO_RAG_TOP_K)
    const results = await knowledgebaseService.search(trimmedQuery, {
      topK,
      threshold: AUTO_RAG_THRESHOLD,
      folders: config?.folders
    })

    if (results.length === 0) {
      return ''
    }

    const sections = results.map((result, index) => [
      `### Result ${index + 1}`,
      '---',
      `- file: ${result.filePath}`,
      `- score: ${result.score}`,
      `- similarity: ${result.similarity}`,
      `- chunk_index: ${result.chunkIndex}`,
      `- range: ${result.charStart}-${result.charEnd}`,
      '---',
      '<excerpt>',
      trimSnippet(result.text),
      '</excerpt>'
    ].join('\n'))

    return [
      '<knowledgebase_context>',
      '## [P1] Knowledgebase Context',
      'The following snippets were retrieved from the local knowledge base for the current user request.',
      'Use them as grounding context when they are relevant to the answer.',
      'When these snippets materially support the answer, mention the file path you relied on.',
      'If more detail is required, call knowledgebase_search for a narrower follow-up lookup.',
      'When you call knowledgebase_search, always pass both query and localized_query, and make localized_query match the current conversation language.',
      '',
      ...sections,
      '</knowledgebase_context>'
    ].join('\n')
  }
}
