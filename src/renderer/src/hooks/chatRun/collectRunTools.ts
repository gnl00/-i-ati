import { useChatStore } from '@renderer/store/chatStore'
import { useMcpRuntimeStore } from '@renderer/store/mcpRuntime'
import toolsDefinitions from '@tools/definitions'

type CollectRunToolsOptions = {
  tools?: any[]
}

type ChatStoreState = ReturnType<typeof useChatStore.getState>

export function collectRunTools(
  state: ChatStoreState,
  options: CollectRunToolsOptions
): any[] {
  const toolsByName = new Map<string, any>()
  const normalizeToolDef = (tool: any): any => {
    if (tool?.function) {
      return {
        ...tool.function,
        ...(tool.source ? { source: tool.source } : {}),
        ...(tool.serverName ? { serverName: tool.serverName } : {}),
        ...(tool.originalName ? { originalName: tool.originalName } : {})
      }
    }
    return tool
  }
  const findToolDefinition = (name: string) => {
    const match = (toolsDefinitions as any[]).find(tool => tool?.function?.name === name)
    if (match?.function) {
      return {
        ...match.function,
        ...(match.source ? { source: match.source } : {})
      }
    }
    return match
  }

  const mcpRuntime = useMcpRuntimeStore.getState()
  mcpRuntime.selectedServerNames.forEach(serverName => {
    mcpRuntime.getServerTools(serverName)?.forEach(tool => {
      const normalized = normalizeToolDef(tool)
      const name = normalized?.name
      if (name) {
        toolsByName.set(name, normalized)
      }
    })
  })

  if (state.webSearchEnable) {
    const tool = findToolDefinition('web_search')
    const normalized = normalizeToolDef(tool)
    const name = normalized?.name
    if (name) {
      toolsByName.set(name, normalized)
    }
  }

  options.tools?.forEach(tool => {
    const normalized = normalizeToolDef(tool)
    const name = normalized?.name
    if (name) {
      toolsByName.set(name, normalized)
    }
  })

  return Array.from(toolsByName.values())
}
