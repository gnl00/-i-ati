import { expect, it } from 'vitest'
import { measureRequestComposition } from '../RequestCompositionMetrics'

it('measures selected request sections without including credentials or content in diagnostics', () => {
  const metrics = measureRequestComposition({ adapterPluginId: 'test', baseUrl: '', apiKey: 'secret-key', model: 'test', systemPrompt: 'policy 中文', tools: [{ name: 'read' }], messages: [
    { role: 'user', content: [{ type: 'input_text', text: 'request' }] },
    { role: 'tool', toolCallId: 'tool', toolName: 'read', content: 'evidence' }
  ] })
  expect(Object.keys(metrics)).toEqual(['system', 'toolSchemas', 'conversation', 'toolResults'])
  expect(metrics.system.utf8Bytes).toBeGreaterThan(metrics.system.characters)
  expect(metrics.toolResults.characters).toBeGreaterThan(0)
  expect(JSON.stringify(metrics)).not.toMatch(/secret-key|policy|evidence|request/)
})
