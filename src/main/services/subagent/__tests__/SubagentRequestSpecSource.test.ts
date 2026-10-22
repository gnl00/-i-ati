import { expect, it } from 'vitest'
import { SubagentRequestSpecSource } from '../runtime/SubagentRequestSpecSource'

it('keeps inherited model transport while replacing parent policy and tool exposure with worker scope', () => {
  const source = new SubagentRequestSpecSource({
    requestSpec: { adapterPluginId: 'test', baseUrl: 'https://example.invalid', apiKey: 'temporary', model: 'cli', systemPrompt: 'parent', tools: [{ name: 'parent-only' }], systemPromptParts: { skillCatalog: { characters: 100, utf8Bytes: 100 } }, requestOverrides: { temperature: 0 } },
    systemPrompt: 'worker', allowedTools: []
  })
  const result = source.resolve({ hostRequest: { hostType: 'subagent', hostRequestId: 'child-run', submittedAt: 1, userContent: [] } })
  expect(result).toMatchObject({ model: 'cli', apiKey: 'temporary', systemPrompt: 'worker', tools: [], requestOverrides: { temperature: 0 } })
  expect(result.systemPromptParts).toEqual({ workerPolicy: { characters: 6, utf8Bytes: 6 } })
})
