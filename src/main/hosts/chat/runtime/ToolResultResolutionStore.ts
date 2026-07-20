import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import {
  DefaultTranscriptRecordFactory,
  type CreateAssistantStepRecordInput,
  type CreateToolResultRecordInput,
  type TranscriptRecordFactory
} from '@main/agent/runtime/transcript/TranscriptRecordFactory'

export class ToolResultResolutionStore {
  private readonly contentByResult = new WeakMap<ToolResultFact, string>()

  set(result: ToolResultFact, content: string): void {
    this.contentByResult.set(result, content)
  }

  resolve(result: ToolResultFact): ToolResultFact {
    const content = this.contentByResult.get(result)
    return content === undefined
      ? result
      : {
          ...result,
          content
        }
  }
}

export class ResolvedToolResultTranscriptRecordFactory
implements TranscriptRecordFactory {
  constructor(
    private readonly resolutions: ToolResultResolutionStore,
    private readonly delegate = new DefaultTranscriptRecordFactory()
  ) {}

  createAssistantStep(input: CreateAssistantStepRecordInput) {
    return this.delegate.createAssistantStep(input)
  }

  createToolResult(input: CreateToolResultRecordInput) {
    return this.delegate.createToolResult({
      ...input,
      result: this.resolutions.resolve(input.result)
    })
  }
}
