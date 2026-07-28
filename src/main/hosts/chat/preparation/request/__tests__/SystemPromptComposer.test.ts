import { describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
  soul: vi.fn(() => '<soul_prompt>soul</soul_prompt>'),
  skills: vi.fn(async (chatId?: number) => {
    void chatId
    return [
      '<skills_system>',
      '<skills_context>catalog</skills_context>',
      '</skills_system>'
    ].join('\n')
  }),
  userInfo: vi.fn(async () => '<user_info_system>profile policy</user_info_system>'),
  emotion: vi.fn(() => '<emotion_system>emotion policy</emotion_system>')
}))

vi.mock('../SoulPromptProvider', () => ({
  SoulPromptProvider: class {
    build(): string {
      return providerMocks.soul()
    }
  }
}))

vi.mock('../SkillsPromptProvider', () => ({
  SkillsPromptProvider: class {
    async build(chatId?: number): Promise<string> {
      return providerMocks.skills(chatId)
    }
  }
}))

vi.mock('../UserInfoPromptProvider', () => ({
  UserInfoPromptProvider: class {
    async build(): Promise<string> {
      return providerMocks.userInfo()
    }
  }
}))

vi.mock('../EmotionPromptProvider', () => ({
  EmotionPromptProvider: class {
    build(): string {
      return providerMocks.emotion()
    }
  }
}))

import { SystemPromptComposer } from '../SystemPromptComposer'

describe('SystemPromptComposer', () => {
  it('composes every stable module exactly once in cache-stable order', async () => {
    const [prompt] = await new SystemPromptComposer().compose(42)
    const orderedMarkers = [
      '<identity_role>',
      '<core_operating_policy>',
      '<state_and_memory>',
      '<tools_execution>',
      '<output_standards>',
      '<soul_prompt>',
      '<skills_system>',
      '<user_info_system>',
      '<emotion_system>'
    ]

    for (const marker of orderedMarkers) {
      expect(prompt.split(marker)).toHaveLength(2)
    }

    const positions = orderedMarkers.map(marker => prompt.indexOf(marker))
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(prompt).toContain('<skills_context>catalog</skills_context>')
    expect(providerMocks.skills).toHaveBeenCalledWith(42)
  })
})
