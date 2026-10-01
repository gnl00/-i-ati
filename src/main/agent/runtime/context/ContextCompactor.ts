import { unifiedChatRequest, prepareUnifiedRequestBody } from '@main/request'
import { buildCompressionPrompt } from '@shared/prompts'
import { resolveRequestOverrides } from '@main/request/overrides'
import type { AgentRequestSpec } from '../request/AgentRequestSpec'
import { RequestTokenizer, resolveContextBudget } from './RequestTokenizer'

export interface ContextCompressionInput {
  text: string
  previousSummary?: string
  requestSpec: AgentRequestSpec
  signal?: AbortSignal
}

/** Shared summary generation; no database identity or host message dependency. */
export const compactContext = async (input: ContextCompressionInput): Promise<string> => {
  input.signal?.throwIfAborted()
  const spec = input.requestSpec
  const tokenizer = new RequestTokenizer(spec.model)
  const request: IUnifiedRequest = {
    adapterPluginId: spec.adapterPluginId,
    baseUrl: spec.baseUrl,
    apiKey: spec.apiKey,
    model: spec.model,
    systemPrompt:
      'You are a message compactor. Produce only the final continuing-session summary requested by the user message.',
    messages: [
      {
        role: 'user',
        content: buildCompressionPrompt({
          conversationText: input.text,
          previousSummary: input.previousSummary
        })
      }
    ],
    stream: false,
    options: {
      maxTokens: Math.min(
        2_048,
        Math.max(1, Math.floor((spec.contextWindowTokens ?? 32_768) * 0.2))
      )
    },
    requestOverrides: resolveRequestOverrides(spec.requestOverrides, 'compression')
  }
  const body = (await prepareUnifiedRequestBody(request)).body
  input.signal?.throwIfAborted()
  const budget = resolveContextBudget(spec.contextWindowTokens, body, tokenizer.estimated)
  if (tokenizer.countValue(body) > budget.input) {
    throw new Error('Compression input exceeds the compaction model token budget')
  }
  const response: IUnifiedResponse = await unifiedChatRequest(
    request,
    input.signal ?? null,
    () => {},
    () => {}
  )
  input.signal?.throwIfAborted()
  const summary = response.content?.trim()
  if (!summary) throw new Error('Context compression returned an empty summary')
  return summary
}
