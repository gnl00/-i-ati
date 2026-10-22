import { describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
  soul: vi.fn(() => '<soul_prompt>soul</soul_prompt>'),
  skills: vi.fn(async () => {
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
    async build(): Promise<string> {
      return providerMocks.skills()
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
  it('omits emotion policy while retaining the other modules when disabled', async () => {
    const [prompt] = await new SystemPromptComposer().compose(false)
    expect(prompt).not.toContain('<emotion_system>')
    expect(prompt).toContain('<soul_prompt>')
    expect(prompt).toContain('<skills_system>')
    expect(prompt).toContain('<user_info_system>')
  })

  it('composes every stable module exactly once in cache-stable order', async () => {
    const [prompt] = await new SystemPromptComposer().compose()
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
    expect(providerMocks.skills).toHaveBeenCalledWith()
  })
})

it('reports each fixed prompt module separately without changing the composed prompt', async () => {
  const onMeasure = vi.fn()
  const composer = new SystemPromptComposer()
  const original = await composer.compose(false)
  expect(await composer.compose(false, onMeasure)).toEqual(original)
  expect(onMeasure).toHaveBeenCalledWith(expect.objectContaining({
    skillCatalog: expect.objectContaining({ characters: expect.any(Number), utf8Bytes: expect.any(Number) }),
    policy: expect.objectContaining({ characters: expect.any(Number) }),
    emotionPolicy: { characters: 0, utf8Bytes: 0 }
  }))
  expect(JSON.stringify(onMeasure.mock.calls)).not.toContain('<skills')
})
