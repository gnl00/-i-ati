export type SearchRankingSignals = {
  exactTextHit: boolean
  exactHeadingHit: boolean
  exactPathHit: boolean
  keywordCoverage: number
  headingCoverage: number
  headingDepthBonus: number
  pathCoverage: number
  filenameCoverage: number
  lexicalScore: number
  headingScore: number
}

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractQueryTerms(query: string): string[] {
  const normalized = normalizeSearchText(query)
  if (!normalized) {
    return []
  }

  const terms = new Set<string>([normalized])
  const asciiTerms = normalized
    .split(/[^a-z0-9_]+/i)
    .map(term => term.trim())
    .filter(term => term.length >= 2)

  asciiTerms.forEach(term => terms.add(term))

  const cjkSequences = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? []
  cjkSequences.forEach((sequence) => {
    terms.add(sequence)
    for (let size = Math.min(sequence.length, 4); size >= 2; size -= 1) {
      for (let i = 0; i <= sequence.length - size; i += 1) {
        terms.add(sequence.slice(i, i + size))
      }
    }
  })

  return Array.from(terms).sort((a, b) => b.length - a.length)
}

function computeCoverage(text: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0
  }

  let matched = 0
  for (const term of terms) {
    if (text.includes(term)) {
      matched += 1
    }
  }
  return matched / terms.length
}

export function computeSearchRankingSignals(input: {
  query: string
  text: string
  filePath: string
  fileName: string
  headingPaths?: string[]
}): SearchRankingSignals {
  const query = normalizeSearchText(input.query)
  const terms = extractQueryTerms(query)
  const normalizedText = normalizeSearchText(input.text)
  const normalizedPath = normalizeSearchText(input.filePath)
  const normalizedFileName = normalizeSearchText(input.fileName)
  const normalizedHeadingPaths = (input.headingPaths ?? [])
    .map(headingPath => normalizeSearchText(headingPath))
    .filter(Boolean)
  const normalizedHeadingText = normalizedHeadingPaths.join(' ')

  const exactTextHit = query.length > 0 && normalizedText.includes(query)
  const exactHeadingHit = query.length > 0 && normalizedHeadingPaths.some(headingPath => headingPath.includes(query))
  const exactPathHit = query.length > 0 && normalizedPath.includes(query)
  const keywordCoverage = computeCoverage(normalizedText, terms)
  const headingCoverage = computeCoverage(normalizedHeadingText, terms)
  const headingDepth = normalizedHeadingPaths.reduce((maxDepth, headingPath) => Math.max(maxDepth, headingPath.split('#').length - 1), 0)
  const headingDepthBonus = exactHeadingHit
    ? Math.min(1, Math.max(0, (headingDepth - 1) * 0.18))
    : 0
  const pathCoverage = computeCoverage(normalizedPath, terms)
  const filenameCoverage = computeCoverage(normalizedFileName, terms)
  const lexicalScore = Math.min(
    1,
    (exactTextHit ? 0.52 : 0)
      + (exactHeadingHit ? 0.14 : 0)
      + (exactPathHit ? 0.1 : 0)
      + keywordCoverage * 0.14
      + headingCoverage * 0.08
      + pathCoverage * 0.05
      + filenameCoverage * 0.07
  )
  const headingScore = Math.min(
    1,
    (exactHeadingHit ? 0.62 : 0)
      + headingCoverage * 0.24
      + headingDepthBonus * 0.14
  )

  return {
    exactTextHit,
    exactHeadingHit,
    exactPathHit,
    keywordCoverage: Number(keywordCoverage.toFixed(4)),
    headingCoverage: Number(headingCoverage.toFixed(4)),
    headingDepthBonus: Number(headingDepthBonus.toFixed(4)),
    pathCoverage: Number(pathCoverage.toFixed(4)),
    filenameCoverage: Number(filenameCoverage.toFixed(4)),
    lexicalScore: Number(lexicalScore.toFixed(4)),
    headingScore: Number(headingScore.toFixed(4))
  }
}
