import type {
  KnowledgebaseChunkCandidate,
  KnowledgebaseIndexableFile
} from '../types'

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function normalizeCommonText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

export function stripMarkup(text: string): string {
  return decodeHtmlEntities(
    text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|pre|code|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
}

export function normalizeMarkdownText(text: string): string {
  return text
    .replace(/^---\n[\s\S]*?\n---\n?/m, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`{1,3}/g, '')
}

export function splitIntoChunks(
  text: string,
  chunkSize: number,
  chunkOverlap: number
): KnowledgebaseChunkCandidate[] {
  const normalized = normalizeCommonText(text)
  if (!normalized) {
    return []
  }

  const chunks: KnowledgebaseChunkCandidate[] = []
  let start = 0
  let index = 0

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length)

    if (end < normalized.length) {
      const window = normalized.slice(start, end)
      const paragraphBreak = window.lastIndexOf('\n\n')
      const lineBreak = window.lastIndexOf('\n')
      const sentenceBreak = Math.max(window.lastIndexOf('. '), window.lastIndexOf('。'), window.lastIndexOf('! '), window.lastIndexOf('? '))
      const preferredBreak = [paragraphBreak, lineBreak, sentenceBreak].find((pos) => pos >= Math.floor(chunkSize * 0.6))

      if (typeof preferredBreak === 'number' && preferredBreak > 0) {
        end = start + preferredBreak + 1
      }
    }

    const chunkText = normalized.slice(start, end).trim()
    if (chunkText) {
      chunks.push({
        text: chunkText,
        chunkIndex: index,
        charStart: start,
        charEnd: end,
        tokenEstimate: estimateTokens(chunkText)
      })
      index += 1
    }

    if (end >= normalized.length) {
      break
    }

    start = Math.max(end - chunkOverlap, start + 1)
  }

  return chunks
}

export function buildBaseMetadata(
  file: KnowledgebaseIndexableFile,
  strategyName: string
): Record<string, unknown> {
  return {
    filePath: file.filePath,
    ext: file.ext,
    strategy: strategyName
  }
}
