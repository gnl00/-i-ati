export interface AssistantMessageTokenUsageDisplay {
  compactLabel: string
  tooltipItems: string[]
  ariaLabel: string
}

const formatTokenCountInK = (value: number): string => {
  if (value <= 0) return '0k'
  return `${(value / 1_000).toFixed(1)}k`
}

const formatHitRate = (hitTokens: number, inputTokens: number): string => {
  if (inputTokens <= 0 || hitTokens <= 0) return '0%'
  const rate = (hitTokens / inputTokens) * 100
  if (rate >= 99.95) return '100%'
  if (rate < 10) return `${rate.toFixed(1)}%`
  return `${Math.round(rate)}%`
}

export const buildAssistantMessageTokenUsageDisplay = (
  usage?: ITokenUsage
): AssistantMessageTokenUsageDisplay | undefined => {
  if (!usage) return undefined

  const inputTokens = Math.max(0, usage.promptTokens)
  const outputTokens = Math.max(0, usage.completionTokens)
  const totalTokens = Math.max(0, usage.totalTokens)
  const cacheTokens = Math.max(0, usage.promptCacheHitTokens ?? 0)
  const cacheHitRate = formatHitRate(cacheTokens, inputTokens)

  return {
    compactLabel: `Usage ${formatTokenCountInK(totalTokens)}`,
    tooltipItems: [
      `Total tokens: ${formatTokenCountInK(totalTokens)}`,
      `Input tokens: ${formatTokenCountInK(inputTokens)}`,
      `Output tokens: ${formatTokenCountInK(outputTokens)}`,
      `Cache hit tokens: ${formatTokenCountInK(cacheTokens)}`,
      `Cache hit rate: ${cacheHitRate}`
    ],
    ariaLabel: [
      `Total tokens ${formatTokenCountInK(totalTokens)}`,
      `Input tokens ${formatTokenCountInK(inputTokens)}`,
      `Output tokens ${formatTokenCountInK(outputTokens)}`,
      `Cache hit tokens ${formatTokenCountInK(cacheTokens)}`,
      `Cache hit rate ${cacheHitRate}`
    ].join(', ')
  }
}
