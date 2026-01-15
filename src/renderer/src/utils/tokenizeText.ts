export const tokenizeText = (text: string): string[] => {
  // Match: whitespace | Latin words (with apostrophes/hyphens) | CJK runs | other symbols
  const pattern =
    /(\s+|[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|[\u3400-\u4DBF]|[\u4E00-\u9FFF]|[\u3040-\u30FF]|[^\s])/g
  return text.match(pattern) ?? []
}
