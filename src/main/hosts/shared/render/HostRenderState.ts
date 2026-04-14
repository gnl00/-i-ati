import type { RunState } from '@shared/run/lifecycle-events'
import type { AgentRenderMessageState } from './AgentRenderState'

export type HostRenderState = {
  committed: AgentRenderMessageState
  preview: AgentRenderMessageState | null
  lifecycle?: RunState
  lastUsage?: ITokenUsage
}
