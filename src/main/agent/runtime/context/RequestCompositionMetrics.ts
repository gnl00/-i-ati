import type { MaterializedProtocolRequest } from './ContextRequest'

export type RequestPartSize = { characters: number; utf8Bytes: number }
const size = (value: unknown): RequestPartSize => {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  return { characters: text.length, utf8Bytes: Buffer.byteLength(text) }
}

/** Sizes of the selected protocol view, without logging content or estimating provider charges. */
export function measureRequestComposition(request: MaterializedProtocolRequest): Record<string, RequestPartSize> {
  return {
    system: size(request.systemPrompt ?? ''),
    toolSchemas: size(request.tools ?? []),
    conversation: size(request.messages.filter(message => message.role !== 'tool')),
    toolResults: size(request.messages.filter(message => message.role === 'tool'))
  }
}
