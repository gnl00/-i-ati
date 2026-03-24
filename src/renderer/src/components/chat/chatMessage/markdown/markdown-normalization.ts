const FENCE_LANGUAGE_CANDIDATES = [
  'plaintext',
  'typescript',
  'javascript',
  'shell',
  'bash',
  'json',
  'yaml',
  'python',
  'html',
  'text',
  'tsx',
  'jsx',
  'xml',
  'css',
  'sql',
  'yml',
  'txt',
  'sh',
  'js',
  'ts',
  'py',
].sort((a, b) => b.length - a.length)

export function normalizeLanguage(lang: string) {
  const lower = lang.toLowerCase()
  if (lower === 'c++') return 'cpp'
  if (lower === 'c#') return 'csharp'
  if (lower === 'typescript') return 'ts'
  if (lower === 'javascript') return 'js'
  if (lower === 'python') return 'py'
  if (lower === 'txt') return 'text'
  return lower
}

type FixedFenceLine = {
  language: string | null
  code: string
  closingFence?: string
}

function splitInlineClosingFence(code: string): { code: string; closingFence?: string } {
  const inlineClosingFenceMatch = code.match(/^(.*?)(\s*```+)\s*$/)
  if (!inlineClosingFenceMatch) {
    return { code }
  }

  return {
    code: inlineClosingFenceMatch[1].replace(/\s+$/, ''),
    closingFence: inlineClosingFenceMatch[2].trim(),
  }
}

function parseMalformedFenceLine(line: string): FixedFenceLine | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const firstTokenMatch = trimmed.match(/^(\S+)([\s\S]*)$/)
  if (!firstTokenMatch) return null

  const token = firstTokenMatch[1]
  const rest = firstTokenMatch[2] ?? ''
  const normalizedToken = normalizeLanguage(token)

  if (FENCE_LANGUAGE_CANDIDATES.includes(normalizedToken)) {
    if (!rest.trim()) return null
    const { code, closingFence } = splitInlineClosingFence(rest.replace(/^\s+/, ''))
    if (!code.trim() && !closingFence) return null
    return { language: normalizedToken, code, closingFence }
  }

  const lowerToken = token.toLowerCase()
  for (const candidate of FENCE_LANGUAGE_CANDIDATES) {
    if (!lowerToken.startsWith(candidate) || lowerToken === candidate) {
      continue
    }

    const suffix = token.slice(candidate.length)
    const combinedCode = `${suffix}${rest}`
    const { code, closingFence } = splitInlineClosingFence(combinedCode.replace(/^\s+/, ''))
    if (!code.trim() && !closingFence) {
      continue
    }

    return {
      language: normalizeLanguage(candidate),
      code,
      closingFence,
    }
  }

  const { code, closingFence } = splitInlineClosingFence(`${token}${rest}`.replace(/^\s+/, ''))
  if (!code.trim() && !closingFence) return null

  return {
    language: null,
    code,
    closingFence,
  }
}

/**
 * Fix malformed code blocks where language identifier is concatenated with code content.
 * Examples:
 * - ```bashecho 'test' -> ```bash\necho 'test'
 * - ```textsubagent ok``` -> ```text\nsubagent ok\n```
 */
export function fixMalformedCodeBlocks(markdown: string): string {
  let fixed = markdown.replace(/([^\s\n])```/g, '$1\n```')

  fixed = fixed.replace(/(^|\n)```([^\n\r]*)/g, (match, prefix, info) => {
    const parsed = parseMalformedFenceLine(String(info ?? ''))
    if (!parsed) return match

    const openingFence = parsed.language ? `\`\`\`${parsed.language}` : '```'
    const closingFence = parsed.closingFence ? `\n${parsed.closingFence}` : ''

    return `${prefix}${openingFence}\n${parsed.code}${closingFence}`
  })

  return fixed
}
