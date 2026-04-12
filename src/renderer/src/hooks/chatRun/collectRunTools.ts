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
  const normalizeToolDef = (tool: any): any => tool?.function ?? tool
  const findToolDefinition = (name: string) => {
    const match = (toolsDefinitions as any[]).find(tool => tool?.function?.name === name)
    return match?.function ?? match
  }

  useMcpRuntimeStore.getState().getAllTools().forEach(tool => {
    const normalized = normalizeToolDef(tool)
    const name = normalized?.name
    if (name) {
      toolsByName.set(name, normalized)
    }
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
