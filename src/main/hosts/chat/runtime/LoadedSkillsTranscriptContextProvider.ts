import {
  type AgentContentPart,
  type AgentTranscriptUserRecord,
  type LoadedSkillsTranscriptContextProvider as RuntimeLoadedSkillsTranscriptContextProvider,
  type LoadedSkillsTranscriptContextProviderInput
} from '@main/agent/contracts/HostRuntimeContracts'
import { LoadedSkillsContextProvider } from '../preparation/request/LoadedSkillsContextProvider'

export class ChatLoadedSkillsTranscriptContextProvider
implements RuntimeLoadedSkillsTranscriptContextProvider {
  constructor(
    private readonly chatId?: number,
    private readonly loadedSkillsContextProvider = new LoadedSkillsContextProvider()
  ) {}

  async build(
    input: LoadedSkillsTranscriptContextProviderInput
  ): Promise<AgentTranscriptUserRecord | null> {
    const message = await this.loadedSkillsContextProvider.build(this.chatId)
    if (!message || typeof message.content !== 'string') {
      return null
    }

    return {
      recordId: input.recordId,
      kind: 'user',
      timestamp: input.timestamp,
      content: [{
        type: 'input_text',
        text: message.content
      } satisfies AgentContentPart]
    }
  }
}

