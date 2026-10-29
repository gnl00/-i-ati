import { describe, expect, it, vi } from 'vitest'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { ChatLoadedSkillsTranscriptContextProvider } from '../LoadedSkillsTranscriptContextProvider'
import type { ToolResultFact } from '@main/agent/contracts/HostRuntimeContracts'

vi.mock('../../preparation/request/LoadedSkillsContextProvider', () => ({
  LoadedSkillsContextProvider: class {}
}))

const result = (toolName: string, status: ToolResultFact['status'] = 'success'): ToolResultFact => ({
  toolName, status, stepId: 'step', toolCallId: 'call', toolCallIndex: 0, content: ''
})

describe('ChatLoadedSkillsTranscriptContextProvider', () => {
  it.each(['load_skill', 'unload_skill'])('refreshes after successful %s and preserves the hidden source', async (toolName) => {
    const build = vi.fn(async (): Promise<ChatMessage> => ({
      role: 'user', segments: [], content: 'active skills', source: MESSAGE_SOURCE.SKILLS_CONTEXT
    }))
    const provider = new ChatLoadedSkillsTranscriptContextProvider(7, { build })
    expect(await provider.build({ recordId: 'record', timestamp: 10, results: [result(toolName)] })).toEqual({
      recordId: 'record', timestamp: 10, kind: 'user', source: MESSAGE_SOURCE.SKILLS_CONTEXT,
      content: [{ type: 'input_text', text: 'active skills' }]
    })
    expect(build).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('does not read skill state for unrelated or unsuccessful tool calls', async () => {
    const build = vi.fn(async () => null)
    const provider = new ChatLoadedSkillsTranscriptContextProvider(7, { build })
    for (const results of [[], [result('read')], [result('load_skill', 'error')], [result('unload_skill', 'denied')]]) {
      expect(await provider.build({ recordId: 'record', timestamp: 1, results })).toBeNull()
    }
    expect(build).not.toHaveBeenCalled()
  })

  it('refreshes once for a batch and preserves the existing null-context fallback', async () => {
    const build = vi.fn(async () => null)
    const provider = new ChatLoadedSkillsTranscriptContextProvider(7, { build })
    expect(await provider.build({ recordId: 'record', timestamp: 1,
      results: [result('load_skill'), result('unload_skill')] })).toBeNull()
    expect(build).toHaveBeenCalledOnce()
  })
})
