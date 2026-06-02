export type ChatInitialTranscriptSeedContent = string | VLMContent[]

export type ChatInitialTranscriptSeed =
  | {
      kind: 'user'
      timestamp?: number
      content: ChatInitialTranscriptSeedContent
    }
  | {
      kind: 'assistant'
      timestamp?: number
      model?: string
      content: ChatInitialTranscriptSeedContent
      reasoning?: string
      toolCalls?: IToolCall[]
    }
  | {
      kind: 'tool'
      timestamp?: number
      toolCallId?: string
      toolName?: string
      content: ChatInitialTranscriptSeedContent
    }
