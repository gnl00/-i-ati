import type { AgentEvent } from '@main/services/next/events/AgentEvent'
import type { AgentEventSink } from '@main/services/next/events/AgentEventSink'
import type { SubagentArtifacts } from '@tools/subagent/index.d'

const maybeCollectFileTouch = (
  filesTouched: Set<string>,
  toolName: string,
  content: unknown
) => {
  if (toolName !== 'write' && toolName !== 'edit') {
    return
  }

  if (!content || typeof content !== 'object') {
    return
  }

  const filePath = (content as { file_path?: unknown }).file_path
  if (typeof filePath === 'string' && filePath.trim()) {
    filesTouched.add(filePath)
  }
}

export class SubagentAgentEventSink implements AgentEventSink {
  private readonly toolsUsed = new Set<string>()
  private readonly filesTouched = new Set<string>()

  async handle(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'step.delta':
        if (event.delta.type === 'tool_call_started') {
          this.toolsUsed.add(event.delta.toolName)
        }
        if (event.delta.type === 'tool_call_ready') {
          this.toolsUsed.add(event.delta.toolCall.function.name)
        }
        return
      case 'tool.awaiting_confirmation':
        this.toolsUsed.add(event.toolName)
        return
      case 'tool.confirmation_denied':
        this.toolsUsed.add(event.deniedResult.toolName)
        maybeCollectFileTouch(
          this.filesTouched,
          event.deniedResult.toolName,
          event.deniedResult.content
        )
        return
      case 'tool.execution_progress':
        if (event.phase === 'started') {
          this.toolsUsed.add(event.toolName)
          return
        }
        this.toolsUsed.add(event.result.toolName)
        maybeCollectFileTouch(this.filesTouched, event.result.toolName, event.result.content)
        return
      default:
        return
    }
  }

  buildArtifacts(): SubagentArtifacts {
    return {
      tools_used: Array.from(this.toolsUsed),
      files_touched: Array.from(this.filesTouched)
    }
  }
}
