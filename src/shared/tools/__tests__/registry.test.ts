import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { embeddedToolsRegistry, type ToolDefinition } from '../registry'

const embeddedTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'test_embedded_tool',
    description: 'A test embedded tool',
    parameters: { type: 'object', properties: {} }
  }
}

const externalTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'test_external_tool',
    description: 'A test external tool',
    parameters: { type: 'object', properties: {} }
  }
}

describe('EmbeddedToolsRegistry', () => {
  beforeEach(() => {
    embeddedToolsRegistry.unregister(embeddedTool.function.name)
    embeddedToolsRegistry.unregisterExternal(externalTool.function.name)
  })

  afterEach(() => {
    embeddedToolsRegistry.unregister(embeddedTool.function.name)
    embeddedToolsRegistry.unregisterExternal(externalTool.function.name)
    embeddedToolsRegistry.clearExternalTools()
  })

  it('getAllTools returns embedded tool definitions only', () => {
    embeddedToolsRegistry.register(embeddedTool.function.name, async () => ({}), embeddedTool)
    embeddedToolsRegistry.registerExternal(externalTool.function.name, externalTool)

    const allTools = embeddedToolsRegistry.getAllTools()
    expect(allTools.map(tool => tool.function.name)).toContain(embeddedTool.function.name)
    expect(allTools.map(tool => tool.function.name)).not.toContain(externalTool.function.name)
  })

  it('getAllToolDefinitions returns embedded and external tools', () => {
    embeddedToolsRegistry.register(embeddedTool.function.name, async () => ({}), embeddedTool)
    embeddedToolsRegistry.registerExternal(externalTool.function.name, externalTool)

    const allTools = embeddedToolsRegistry.getAllToolDefinitions()
    expect(allTools.map(tool => tool.function.name)).toContain(embeddedTool.function.name)
    expect(allTools.map(tool => tool.function.name)).toContain(externalTool.function.name)
  })

  it('availableTools returns only external tool summaries', () => {
    embeddedToolsRegistry.register(embeddedTool.function.name, async () => ({}), embeddedTool)
    embeddedToolsRegistry.registerExternal(externalTool.function.name, externalTool)

    const available = embeddedToolsRegistry.availableTools()
    expect(available).toEqual([
      {
        name: externalTool.function.name,
        description: externalTool.function.description
      }
    ])
  })
})
