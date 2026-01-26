export const extractUsageFromChunk = (raw: any): ITokenUsage | undefined => {
  if (!raw?.usage) return undefined
  const usage = raw.usage
  if (
    typeof usage.prompt_tokens !== 'number' ||
    typeof usage.completion_tokens !== 'number' ||
    typeof usage.total_tokens !== 'number'
  ) {
    return undefined
  }
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens
  }
}

export const buildUsageOnlyResponse = (
  raw: any,
  options?: { idFallback?: string; modelFallback?: string }
): IUnifiedResponse | null => {
  const usage = extractUsageFromChunk(raw)
  if (!usage) return null
  return {
    id: raw?.id || options?.idFallback || `chatcmpl-${Date.now()}`,
    model: raw?.model || options?.modelFallback || 'unknown',
    timestamp: Date.now(),
    content: '',
    finishReason: 'stop',
    usage,
    raw
  }
}

export const buildUsageOnlyStreamResponse = (
  raw: any,
  options?: { idFallback?: string; modelFallback?: string }
): IUnifiedStreamResponse | null => {
  const usage = extractUsageFromChunk(raw)
  if (!usage) return null
  return {
    id: raw?.id || options?.idFallback || 'stream',
    model: raw?.model || options?.modelFallback || 'unknown',
    usage,
    raw
  }
}
