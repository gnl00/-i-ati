import type { KnowledgebaseChunkCandidate } from '../types'
import type { IndexStrategy, IndexStrategyInput } from './types'
import {
  buildBaseMetadata,
  estimateTokens,
  splitIntoChunks
} from './shared'

type MarkdownHeading = {
  level: number
  text: string
}

type MarkdownSection = {
  headingPath: MarkdownHeading[]
  bodyLines: string[]
}

type MarkdownSourceBlock = {
  text: string
  sourceStart: number
  sourceEnd: number
}

type MarkdownChunkUnit = {
  text: string
  sourceStart: number
  sourceEnd: number
  headingPathText: string
  headingDepth: number
}

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/
const HEADING_RE = /^(#{1,6})[ \t]+(.+?)\s*$/
const FENCE_RE = /^(```+|~~~+)/

function normalizeMarkdownDocument(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER_RE, '')
}

function normalizeInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+#+\s*$/g, '')
}

function normalizeHeadingText(text: string): string {
  return normalizeMarkdownDocument(normalizeInlineMarkdown(text))
}

function parseMarkdownSections(rawText: string): MarkdownSection[] {
  const lines = stripFrontmatter(rawText)
    .replace(/\r\n/g, '\n')
    .split('\n')

  const sections: MarkdownSection[] = []
  const headingStack: MarkdownHeading[] = []
  let currentSection: MarkdownSection = {
    headingPath: [],
    bodyLines: []
  }
  let inFence = false

  const pushCurrentSection = (): void => {
    const hasBody = currentSection.bodyLines.some(line => line.trim().length > 0)
    const hasHeading = currentSection.headingPath.length > 0
    if (!hasBody && !hasHeading) {
      return
    }

    sections.push({
      headingPath: currentSection.headingPath.map((heading) => ({ ...heading })),
      bodyLines: [...currentSection.bodyLines]
    })
  }

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      inFence = !inFence
      currentSection.bodyLines.push(line)
      continue
    }

    if (!inFence) {
      const headingMatch = line.match(HEADING_RE)
      if (headingMatch) {
        pushCurrentSection()

        const level = headingMatch[1].length
        const headingText = normalizeHeadingText(headingMatch[2])

        while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
          headingStack.pop()
        }

        headingStack.push({
          level,
          text: headingText
        })

        currentSection = {
          headingPath: headingStack.map((heading) => ({ ...heading })),
          bodyLines: []
        }
        continue
      }
    }

    currentSection.bodyLines.push(line)
  }

  pushCurrentSection()
  return sections
}

function splitSectionBodyIntoBlocks(lines: string[]): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false
  let currentIsFence = false

  const pushCurrent = (): void => {
    if (current.length === 0) {
      return
    }

    const rawBlock = current.join('\n')
    const normalizedBlock = currentIsFence
      ? normalizeMarkdownDocument(rawBlock)
      : normalizeMarkdownDocument(normalizeInlineMarkdown(rawBlock))

    if (normalizedBlock) {
      blocks.push(normalizedBlock)
    }
    current = []
    currentIsFence = false
  }

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      if (!inFence && current.length > 0) {
        pushCurrent()
      }

      if (!inFence) {
        currentIsFence = true
      }
      current.push(line)
      inFence = !inFence

      if (!inFence) {
        pushCurrent()
      }
      continue
    }

    if (inFence) {
      current.push(line)
      continue
    }

    if (!line.trim()) {
      pushCurrent()
      continue
    }

    current.push(line)
  }

  pushCurrent()
  return blocks
}

function renderHeadingPath(headings: MarkdownHeading[]): string {
  return headings
    .map((heading) => `${'#'.repeat(heading.level)} ${heading.text}`)
    .join('\n')
}

function joinMarkdownParts(parts: string[]): string {
  return normalizeMarkdownDocument(parts.filter(Boolean).join('\n\n'))
}

function renderSectionSource(
  section: MarkdownSection
): {
  headingPrefix: string
  text: string
  blocks: MarkdownSourceBlock[]
} {
  const headingPrefix = renderHeadingPath(section.headingPath)
  const bodyBlocks = splitSectionBodyIntoBlocks(section.bodyLines)
  let text = ''
  let cursor = 0

  const append = (value: string): void => {
    text += value
    cursor += value.length
  }

  const blocks: MarkdownSourceBlock[] = []

  if (headingPrefix) {
    append(headingPrefix)
  }

  if (headingPrefix && bodyBlocks.length > 0) {
    append('\n\n')
  }

  bodyBlocks.forEach((blockText, index) => {
    if (index > 0) {
      append('\n\n')
    }

    const sourceStart = cursor
    append(blockText)
    blocks.push({
      text: blockText,
      sourceStart,
      sourceEnd: cursor
    })
  })

  return {
    headingPrefix,
    text: normalizeMarkdownDocument(text),
    blocks
  }
}

function measureChunkLength(headingPrefix: string, blocks: MarkdownSourceBlock[]): number {
  return joinMarkdownParts([
    headingPrefix,
    ...blocks.map(block => block.text)
  ]).length
}

function selectOverlapBlocks(blocks: MarkdownSourceBlock[], overlapSize: number): MarkdownSourceBlock[] {
  if (overlapSize <= 0 || blocks.length === 0) {
    return []
  }

  const selected: MarkdownSourceBlock[] = []
  let total = 0

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!
    selected.unshift(block)
    total += block.text.length + (selected.length > 1 ? 2 : 0)

    if (total >= overlapSize) {
      break
    }
  }

  return selected
}

function expandOversizedBlocks(
  blocks: MarkdownSourceBlock[],
  maxBlockSize: number
): MarkdownSourceBlock[] {
  if (maxBlockSize <= 0) {
    return blocks
  }

  return blocks.flatMap((block) => {
    if (block.text.length <= maxBlockSize) {
      return [block]
    }

    return splitIntoChunks(block.text, maxBlockSize, Math.min(120, Math.floor(maxBlockSize * 0.25))).map((chunk) => ({
      text: chunk.text,
      sourceStart: block.sourceStart + chunk.charStart,
      sourceEnd: block.sourceStart + chunk.charEnd
    }))
  })
}

function buildSectionUnits(
  section: MarkdownSection,
  sourceOffset: number,
  chunkSize: number,
  chunkOverlap: number
): {
  sectionText: string
  units: MarkdownChunkUnit[]
} {
  const rendered = renderSectionSource(section)
  if (!rendered.text) {
    return {
      sectionText: '',
      units: []
    }
  }

  const headingPrefix = rendered.headingPrefix
  if (rendered.blocks.length === 0) {
    return {
      sectionText: rendered.text,
      units: [{
        text: rendered.text,
        sourceStart: sourceOffset,
        sourceEnd: sourceOffset + rendered.text.length,
        headingPathText: headingPrefix,
        headingDepth: section.headingPath.length
      }]
    }
  }

  const contentBudget = Math.max(Math.floor(chunkSize * 0.5), chunkSize - headingPrefix.length - 2)
  const effectiveOverlap = Math.min(chunkOverlap, Math.max(80, Math.floor(contentBudget * 0.45)))
  const blocks = expandOversizedBlocks(rendered.blocks, contentBudget)
  const units: MarkdownChunkUnit[] = []
  let currentBlocks: MarkdownSourceBlock[] = []
  let pointer = 0

  const pushUnit = (selectedBlocks: MarkdownSourceBlock[]): void => {
    if (selectedBlocks.length === 0) {
      return
    }

    const unitText = joinMarkdownParts([
      headingPrefix,
      ...selectedBlocks.map(block => block.text)
    ])

    units.push({
      text: unitText,
      sourceStart: sourceOffset,
      sourceEnd: sourceOffset + selectedBlocks[selectedBlocks.length - 1]!.sourceEnd,
      headingPathText: headingPrefix,
      headingDepth: section.headingPath.length
    })
  }

  while (pointer < blocks.length) {
    const nextBlock = blocks[pointer]!
    const candidate = [...currentBlocks, nextBlock]

    if (currentBlocks.length > 0 && measureChunkLength(headingPrefix, candidate) > chunkSize) {
      pushUnit(currentBlocks)
      currentBlocks = selectOverlapBlocks(currentBlocks, effectiveOverlap)

      if (currentBlocks.length > 0 && measureChunkLength(headingPrefix, [...currentBlocks, nextBlock]) > chunkSize) {
        currentBlocks = []
      }
      continue
    }

    currentBlocks.push(nextBlock)
    pointer += 1
  }

  pushUnit(currentBlocks)

  return {
    sectionText: rendered.text,
    units
  }
}

function buildFinalChunks(
  units: MarkdownChunkUnit[],
  chunkSize: number,
  chunkOverlap: number
): KnowledgebaseChunkCandidate[] {
  if (units.length === 0) {
    return []
  }

  const chunks: KnowledgebaseChunkCandidate[] = []
  const effectiveOverlap = Math.min(chunkOverlap, Math.max(120, Math.floor(chunkSize * 0.35)))
  let currentUnits: MarkdownChunkUnit[] = []
  let pointer = 0
  let chunkIndex = 0

  const pushChunk = (selectedUnits: MarkdownChunkUnit[]): void => {
    if (selectedUnits.length === 0) {
      return
    }

    const text = joinMarkdownParts(selectedUnits.map(unit => unit.text))
    const headingPaths = Array.from(new Set(
      selectedUnits
        .map(unit => unit.headingPathText)
        .filter(Boolean)
    ))
    const headingDepth = selectedUnits.reduce((maxDepth, unit) => Math.max(maxDepth, unit.headingDepth), 0)
    chunks.push({
      text,
      chunkIndex,
      charStart: selectedUnits[0]!.sourceStart,
      charEnd: selectedUnits[selectedUnits.length - 1]!.sourceEnd,
      tokenEstimate: estimateTokens(text),
      metadata: headingPaths.length > 0
        ? {
            headingPaths,
            headingDepth,
            primaryHeadingPath: headingPaths[0]
          }
        : undefined
    })
    chunkIndex += 1
  }

  while (pointer < units.length) {
    const nextUnit = units[pointer]!
    const candidateText = joinMarkdownParts([
      ...currentUnits.map(unit => unit.text),
      nextUnit.text
    ])

    if (currentUnits.length > 0 && candidateText.length > chunkSize) {
      pushChunk(currentUnits)

      const overlapUnits: MarkdownChunkUnit[] = []
      let overlapLength = 0

      for (let index = currentUnits.length - 1; index >= 0; index -= 1) {
        const unit = currentUnits[index]!
        overlapUnits.unshift(unit)
        overlapLength += unit.text.length + (overlapUnits.length > 1 ? 2 : 0)
        if (overlapLength >= effectiveOverlap) {
          break
        }
      }

      currentUnits = overlapUnits
      if (currentUnits.length > 0) {
        const retryText = joinMarkdownParts([
          ...currentUnits.map(unit => unit.text),
          nextUnit.text
        ])
        if (retryText.length > chunkSize) {
          currentUnits = []
        }
      }
      continue
    }

    currentUnits.push(nextUnit)
    pointer += 1
  }

  pushChunk(currentUnits)
  return chunks
}

export class MDIndexStrategy implements IndexStrategy {
  readonly name = 'markdown'

  supports(input: IndexStrategyInput['file']): boolean {
    return input.ext === '.md'
  }

  prepare(input: IndexStrategyInput) {
    const sections = parseMarkdownSections(input.rawText)
    let sourceOffset = 0
    const sectionUnits: MarkdownChunkUnit[] = []
    const normalizedSections: string[] = []

    sections.forEach((section, index) => {
      const built = buildSectionUnits(section, sourceOffset, input.chunkSize, input.chunkOverlap)
      if (built.sectionText) {
        normalizedSections.push(built.sectionText)
        sectionUnits.push(...built.units)
        sourceOffset += built.sectionText.length
        if (index < sections.length - 1) {
          sourceOffset += 2
        }
      }
    })

    const normalizedText = normalizeMarkdownDocument(normalizedSections.join('\n\n'))

    return {
      strategyName: this.name,
      normalizedText,
      chunks: buildFinalChunks(sectionUnits, input.chunkSize, input.chunkOverlap),
      sharedMetadata: buildBaseMetadata(input.file, this.name)
    }
  }
}
