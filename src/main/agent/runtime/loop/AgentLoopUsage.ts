const addOptionalTokenCount = (previous?: number, next?: number): number | undefined => {
  if (previous === undefined) return next
  if (next === undefined) return previous
  return previous + next
}

export const mergeUsage = (
  previous: ITokenUsage | undefined,
  next: ITokenUsage | undefined
): ITokenUsage | undefined => {
  if (!previous) return next
  if (!next) return previous
  const promptCacheHitTokens = addOptionalTokenCount(previous.promptCacheHitTokens, next.promptCacheHitTokens)
  const promptCacheMissTokens = addOptionalTokenCount(previous.promptCacheMissTokens, next.promptCacheMissTokens)
  const promptCacheWriteTokens = addOptionalTokenCount(previous.promptCacheWriteTokens, next.promptCacheWriteTokens)
  const reasoningTokens = addOptionalTokenCount(previous.reasoningTokens, next.reasoningTokens)

  const usage: ITokenUsage = {
    promptTokens: previous.promptTokens + next.promptTokens,
    completionTokens: previous.completionTokens + next.completionTokens,
    totalTokens: previous.totalTokens + next.totalTokens
  }
  if (promptCacheHitTokens !== undefined) usage.promptCacheHitTokens = promptCacheHitTokens
  if (promptCacheMissTokens !== undefined) usage.promptCacheMissTokens = promptCacheMissTokens
  if (promptCacheWriteTokens !== undefined) usage.promptCacheWriteTokens = promptCacheWriteTokens
  if (reasoningTokens !== undefined) usage.reasoningTokens = reasoningTokens

  return usage
}
