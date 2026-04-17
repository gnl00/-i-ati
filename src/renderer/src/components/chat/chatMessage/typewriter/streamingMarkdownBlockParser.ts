export type MarkdownBlock =
  | { type: 'heading'; level: number; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; lines: string[] }

export type ParsedMarkdownBlock = MarkdownBlock & {
  startOffset: number
}

export interface MarkdownBlockParseSnapshot {
  text: string
  blocks: ParsedMarkdownBlock[]
}

const BLANK_LINE_BOUNDARY_RE = /\n\s*\n\s*$/

export const parseMarkdownBlocks = (
  text: string,
  baseOffset = 0
): ParsedMarkdownBlock[] => {
  const lines = text.split('\n')
  const lineOffsets: number[] = []
  const blocks: ParsedMarkdownBlock[] = []
  let cursor = baseOffset

  for (const line of lines) {
    lineOffsets.push(cursor)
    cursor += line.length + 1
  }

  let i = 0

  const pushParagraph = (content: string, startOffset: number) => {
    if (!content.trim()) return
    blocks.push({ type: 'paragraph', content, startOffset })
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    const startOffset = lineOffsets[i] ?? baseOffset

    if (!trimmed) {
      i += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i += 1
      }
      blocks.push({ type: 'code', language, content: codeLines.join('\n'), startOffset })
      continue
    }

    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/)
      if (match) {
        blocks.push({
          type: 'heading',
          level: match[1].length,
          content: match[2],
          startOffset
        })
        i += 1
        continue
      }
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ type: 'quote', lines: quoteLines, startOffset })
      continue
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (orderedMatch || unorderedMatch) {
      const ordered = Boolean(orderedMatch)
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i].trim()
        const orderedLine = current.match(/^(\d+)\.\s+(.*)$/)
        const unorderedLine = current.match(/^[-*+]\s+(.*)$/)
        if (ordered && orderedLine) {
          items.push(orderedLine[2])
          i += 1
          continue
        }
        if (!ordered && unorderedLine) {
          items.push(unorderedLine[1])
          i += 1
          continue
        }
        break
      }
      blocks.push({ type: 'list', ordered, items, startOffset })
      continue
    }

    const paragraphLines: string[] = [line]
    i += 1
    while (i < lines.length) {
      const next = lines[i]
      const nextTrimmed = next.trim()
      if (!nextTrimmed) {
        i += 1
        break
      }
      if (
        nextTrimmed.startsWith('```') ||
        nextTrimmed.startsWith('#') ||
        nextTrimmed.startsWith('>') ||
        /^(\d+)\.\s+/.test(nextTrimmed) ||
        /^[-*+]\s+/.test(nextTrimmed)
      ) {
        break
      }
      paragraphLines.push(next)
      i += 1
    }
    pushParagraph(paragraphLines.join('\n'), startOffset)
  }

  return blocks
}

export const buildMarkdownBlockParseSnapshot = (
  text: string,
  previous?: MarkdownBlockParseSnapshot
): MarkdownBlockParseSnapshot => {
  if (!previous || previous.text === text) {
    return {
      text,
      blocks: previous?.text === text ? previous.blocks : parseMarkdownBlocks(text)
    }
  }

  if (!text.startsWith(previous.text) || previous.blocks.length === 0) {
    return {
      text,
      blocks: parseMarkdownBlocks(text)
    }
  }

  const reparseFromOffset = BLANK_LINE_BOUNDARY_RE.test(previous.text)
    ? previous.text.length
    : previous.blocks[previous.blocks.length - 1]?.startOffset ?? 0

  const stableBlocks = reparseFromOffset >= previous.text.length
    ? previous.blocks
    : previous.blocks.slice(0, -1)
  const reparsedBlocks = parseMarkdownBlocks(text.slice(reparseFromOffset), reparseFromOffset)

  return {
    text,
    blocks: stableBlocks.concat(reparsedBlocks)
  }
}
