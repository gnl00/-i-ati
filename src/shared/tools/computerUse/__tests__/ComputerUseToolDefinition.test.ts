import { describe, expect, it } from 'vitest'
import tools from '@tools/definitions'
import { computerUseActions } from '../actions'
import { computerUseTools } from '../definitions'
import { computerUseToolMetadata } from '../metadata'

describe('computer_use contract', () => {
  it('exposes exactly one flat tool and every supported action', () => {
    expect(
      tools
        .filter(tool => tool.function.name.startsWith('computer_use'))
        .map(tool => tool.function.name)
    ).toEqual(['computer_use'])
    expect(computerUseTools).toHaveLength(1)
    const schema = computerUseTools[0].function.parameters
    expect(schema.required).toEqual(['action'])
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.action.enum).toEqual(
      Object.keys(computerUseActions)
    )
    expect(Object.keys(computerUseActions)).toHaveLength(15)
    for (const fields of Object.values(computerUseActions)) {
      for (const key of [...fields.required, ...fields.optional]) {
        expect(schema.properties).toHaveProperty(key)
      }
    }
  })

  it('preserves per-action risks and denies subagents', () => {
    expect(Object.keys(computerUseToolMetadata)).toEqual(['computer_use'])
    const metadata = computerUseToolMetadata.computer_use
    expect(metadata).toMatchObject({
      capability: 'computer_use',
      riskLevel: 'dangerous',
      subagent: 'deny',
      mutatesWorkspace: false
    })
    expect(Object.keys(metadata.actionOverrides)).toEqual(
      Object.keys(computerUseActions)
    )
    for (const [action, override] of Object.entries(metadata.actionOverrides)) {
      const expected = [
        'status',
        'apps',
        'running_apps',
        'windows',
        'finish'
      ].includes(action)
        ? 'none'
        : ['request_permissions', 'open_app', 'state'].includes(action)
          ? 'warning'
          : 'dangerous'
      expect(override.riskLevel).toBe(expected)
    }
  })
})
