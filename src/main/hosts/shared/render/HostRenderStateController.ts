import type { HostRenderEvent } from './HostRenderEvent'
import type { HostRenderState } from './HostRenderState'

const emptyMessageState = (): import('./AgentRenderState').AgentRenderMessageState => ({
  stepId: undefined,
  content: '',
  blocks: [],
  toolCalls: []
})

const cloneMessageState = (
  state: import('./AgentRenderState').AgentRenderMessageState
): import('./AgentRenderState').AgentRenderMessageState => ({
  ...state,
  blocks: state.blocks.map((block) => ({ ...block })),
  toolCalls: [...state.toolCalls]
})

export class HostRenderStateController {
  private state: HostRenderState = {
    committed: emptyMessageState(),
    preview: null,
    lifecycle: undefined,
    lastUsage: undefined
  }

  apply(event: HostRenderEvent): HostRenderState {
    switch (event.type) {
      case 'host.preview.updated':
        this.state = {
          ...this.state,
          preview: cloneMessageState(event.preview)
        }
        break
      case 'host.preview.cleared':
        this.state = {
          ...this.state,
          preview: null
        }
        break
      case 'host.committed.updated':
        this.state = {
          ...this.state,
          committed: cloneMessageState(event.committed),
          preview: null
        }
        break
      case 'host.lifecycle.updated':
        this.state = {
          ...this.state,
          lifecycle: event.state
        }
        break
      case 'host.usage.updated':
        this.state = {
          ...this.state,
          lastUsage: event.usage
        }
        break
      default:
        break
    }

    return this.snapshot()
  }

  snapshot(): HostRenderState {
    return {
      committed: cloneMessageState(this.state.committed),
      preview: this.state.preview ? cloneMessageState(this.state.preview) : null,
      lifecycle: this.state.lifecycle,
      lastUsage: this.state.lastUsage
    }
  }
}
