import type { RunToolSelection } from '@shared/run/toolSelection'
import { useMcpRuntimeStore } from '@renderer/features/settings'

type NamedTool = { name?: string; function?: { name?: string }; [key: string]: unknown }

export function collectRunToolSelection(
  state: { webSearchEnable: boolean },
  options: { tools?: NamedTool[] }
): RunToolSelection {
  const names = new Set<string>()
  useMcpRuntimeStore.getState().availableMcpTools.forEach(tools => {
    tools.forEach(tool => names.add(tool.function.name))
  })
  options.tools?.forEach(tool => {
    const name = tool.function?.name ?? tool.name
    if (name) names.add(name)
  })
  return { webSearchEnabled: state.webSearchEnable, toolNames: [...names] }
}
