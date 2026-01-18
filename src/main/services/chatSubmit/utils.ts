export const formatWebSearchForLLM = (response: any): string => {
  if (!response.success || !response.results || response.results.length === 0) {
    return JSON.stringify({
      success: false,
      error: response.error || 'No results found',
      functionCallCompleted: true
    })
  }

  const formattedResults = response.results
    .filter((r: any) => r.success)
    .map((r: any, index: number) => ({
      index: index + 1,
      title: r.title,
      link: r.link,
      snippet: r.snippet,
      content: r.content.substring(0, 2000)
    }))

  return JSON.stringify({
    success: true,
    query: response.results[0]?.query || '',
    results: formattedResults,
    totalResults: response.results.length,
    successfulResults: formattedResults.length,
    functionCallCompleted: true
  })
}

export const decodeEscapedString = (value: string) =>
  value
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

export const normalizeToolArgs = (args: any): any => {
  if (Array.isArray(args)) return args.map(normalizeToolArgs)
  if (args && typeof args === 'object') {
    const normalized: Record<string, any> = {}
    for (const [key, val] of Object.entries(args)) {
      normalized[key] =
        typeof val === 'string' ? decodeEscapedString(val) : normalizeToolArgs(val)
    }
    return normalized
  }
  return args
}
