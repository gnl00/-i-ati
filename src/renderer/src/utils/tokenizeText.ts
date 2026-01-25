export const tokenizeText = (text: string): string[] => {
  // Match: whitespace | Latin words (with apostrophes/hyphens) | CJK runs | other symbols
  const pattern =
    /(\s+|[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|[\u3400-\u4DBF]|[\u4E00-\u9FFF]|[\u3040-\u30FF]|[^\s])/gu
  const tokens = text.match(pattern) ?? []
  const latinWord = /^[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*$/
  const chunkSize = 3
  const refined: string[] = []

  for (const token of tokens) {
    if (latinWord.test(token) && token.length > chunkSize) {
      for (let i = 0; i < token.length; i += chunkSize) {
        refined.push(token.slice(i, i + chunkSize))
      }
      continue
    }
    refined.push(token)
  }

  return refined
}
