import * as o200k from 'gpt-tokenizer/encoding/o200k_base'
import * as cl100k from 'gpt-tokenizer/encoding/cl100k_base'

/** Token counts for unknown models are estimates, never a provider guarantee. */
export class RequestTokenizer {
  readonly encoding: 'o200k_base' | 'cl100k_base'
  estimated: boolean
  private readonly encoder: typeof cl100k
  private readonly cache = new Map<string, number>()

  constructor(model: string) {
    this.encoding = /^(gpt-4o|gpt-4\.1|gpt-5|o[134](?:-|$))/.test(model)
      ? 'o200k_base'
      : 'cl100k_base'
    this.estimated = !/^(gpt-4o|gpt-4\.1|gpt-5|gpt-4(?:-|$)|gpt-3\.5|o[134](?:-|$))/.test(model)
    this.encoder = this.encoding === 'o200k_base' ? o200k : cl100k
  }

  count(text: string): number {
    const cached = this.cache.get(text)
    if (cached !== undefined) return cached
    // Treat literal special-token spellings as ordinary user text.
    // BPE merging is quadratic for uninterrupted blobs. Bound each piece and mark
    // chunk-boundary counts as estimates; the budget then reserves a larger margin.
    const chunked = text.length > 16_384
    if (chunked) this.estimated = true
    let tokens = 0
    for (let start = 0; start < text.length;) {
      let end = chunked ? Math.min(start + 8_192, text.length) : text.length
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--
      tokens += this.encoder.countTokens(text.slice(start, end), { disallowedSpecial: new Set() })
      start = end
    }
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(text, tokens)
    return tokens
  }

  countValue(value: unknown): number {
    return this.count(JSON.stringify(value) ?? '')
  }
}

export const resolveContextBudget = (
  contextWindowTokens: number | undefined,
  body: Record<string, unknown>,
  estimated: boolean
): {
  window: number
  input: number
  output: number
  windowUnknown: boolean
} => {
  const known =
    typeof contextWindowTokens === 'number' &&
    Number.isFinite(contextWindowTokens) &&
    contextWindowTokens > 0
  const window = known ? Math.floor(contextWindowTokens) : 32_768
  const explicit = [
    body.max_tokens,
    body.max_completion_tokens,
    body.max_output_tokens,
    (body.generationConfig as { maxOutputTokens?: unknown } | undefined)?.maxOutputTokens,
    (body.options as { maxTokens?: unknown } | undefined)?.maxTokens
  ].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  )
  const output = explicit.length
    ? Math.ceil(Math.max(...explicit))
    : Math.min(8_192, Math.ceil(window * 0.2))
  const margin = Math.ceil(window * (estimated ? 0.15 : 0.05))
  return {
    window,
    output,
    input: Math.max(0, window - output - margin),
    windowUnknown: !known
  }
}
