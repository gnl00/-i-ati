import type { RunEvent, RunEventEnvelope } from '@shared/run/events'
import { applyMessageSegmentPatchToEntity } from '@shared/run/messagePatch'
import type { PendingToolQuestion } from '@shared/tools/userQuestion'
import type { ToolConfirmation } from '@shared/tools/confirmation'
import type { RunToolEventPayloads } from '@shared/run/tool-events'

export type TuiInteraction =
  | {
      kind: 'approval'
      submissionId: string
      payload: RunToolEventPayloads['tool.confirmation.required']
    }
  | { kind: 'question'; submissionId: string; payload: PendingToolQuestion }

export type TuiQueueItem = {
  id: string
  text: string
  mode: 'steer' | 'followUp' | 'returned'
}
export type TuiTool = {
  name: string
  args?: unknown
  status: string
  output: string
}

export function displayText(value: unknown): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? '')
  // Model and tool output may contain terminal control sequences. Only our renderer owns them.
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|.)/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
  )
}

export function contentText(content: ChatMessage['content']): string {
  return typeof content === 'string'
    ? content
    : content
        .filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join('\n')
}

/** Terminal-only projection. Persistence and model context remain owned by Chat. */
export class TuiState {
  chat?: ChatEntity
  model?: ModelRef
  messages: MessageEntity[] = []
  messageRuns = new WeakMap<MessageEntity, string>()
  draft = ''
  preview?: MessageEntity
  tools = new Map<string, TuiTool>()
  queue: TuiQueueItem[] = []
  interactions: TuiInteraction[] = []
  private readonly approvalVersions = new Map<string, number>()
  activeRun?: string
  status = '就绪'
  notice = ''
  usage?: ITokenUsage
  trimmed = false
  showThinking = false
  expandTools = false
  onChange: (immediate?: boolean) => void = () => {}

  load(chat: ChatEntity, messages: MessageEntity[]): void {
    this.chat = chat
    this.messages = [...messages]
    this.preview = undefined
    this.tools.clear()
    this.interactions = []
    this.approvalVersions.clear()
    this.trimmed = false
    this.trim()
    this.onChange(true)
  }

  handleEvent(envelope: RunEventEnvelope): void {
    if (envelope.submissionId !== this.activeRun) return
    if (envelope.chatUuid && envelope.chatUuid !== this.chat?.uuid) return
    const event = envelope as RunEvent
    let immediate = true
    switch (event.type) {
      case 'chat.ready':
      case 'chat.updated':
        this.chat = event.payload.chatEntity
        break
      case 'messages.loaded':
        this.messages = [...event.payload.messages]
        break
      case 'message.created':
      case 'message.updated': {
        const message = {
          ...event.payload.message,
          body: { ...event.payload.message.body }
        }
        this.messageRuns.set(message, event.submissionId)
        const index = this.messages.findIndex((m) => m.id === message.id)
        if (message.id != null && index >= 0) this.messages[index] = message
        else this.messages.push(message)
        break
      }
      case 'message.segment.updated': {
        const index = this.messages.findIndex((m) => m.id === event.payload.messageId)
        if (index >= 0)
          this.messages[index] = applyMessageSegmentPatchToEntity(
            this.messages[index],
            event.payload.patch
          )
        if (index >= 0) this.messageRuns.set(this.messages[index], event.submissionId)
        immediate = false
        break
      }
      case 'preview.updated':
        this.preview = event.payload.message
        immediate = false
        break
      case 'preview.segment.updated':
        if (this.preview)
          this.preview = applyMessageSegmentPatchToEntity(this.preview, event.payload.patch)
        immediate = false
        break
      case 'preview.cleared':
        this.preview = undefined
        break
      case 'tool.call.detected': {
        const call = event.payload.toolCall
        this.tools.set(call.id, {
          name: call.name,
          args: call.args,
          status: '准备',
          output: ''
        })
        break
      }
      case 'tool.confirmation.required':
        if ((this.approvalVersions.get(event.payload.confirmationId) ?? 0) >= event.payload.version) return
        this.approvalVersions.set(event.payload.confirmationId, event.payload.version)
        this.clearApproval(event.payload.toolCallId)
        this.updateTool(event.payload.toolCallId, { name: event.payload.name, status: '等待审批' })
        this.interactions.push({
          kind: 'approval',
          submissionId: event.submissionId,
          payload: event.payload
        })
        break
      case 'tool.confirmation.resolved':
        this.resolveApproval(event.payload)
        break
      case 'tool.user_question.required':
        this.interactions.push({
          kind: 'question',
          submissionId: event.submissionId,
          payload: {
            ...event.payload,
            submissionId: event.submissionId,
            chatUuid: this.chat!.uuid
          }
        })
        break
      case 'tool.user_question.resolved':
        this.interactions = this.interactions.filter(
          (i) => i.kind !== 'question' || i.payload.interactionId !== event.payload.interactionId
        )
        break
      case 'tool.execution.started':
        this.updateTool(event.payload.toolCallId, {
          name: event.payload.name,
          status: '运行'
        })
        this.clearApproval(event.payload.toolCallId)
        break
      case 'tool.execution.output': {
        const { toolCallId, chunks } = event.payload
        const previous = this.tools.get(toolCallId)?.output ?? ''
        this.updateTool(toolCallId, {
          output: (previous + chunks.map((chunk) => chunk.text).join('')).slice(-65536)
        })
        immediate = false
        break
      }
      case 'tool.execution.completed':
        this.updateTool(event.payload.toolCallId, {
          status: event.payload.failure ? '失败' : '完成',
          output: displayText(event.payload.result).slice(-65536)
        })
        this.clearApproval(event.payload.toolCallId)
        break
      case 'tool.execution.failed':
        this.updateTool(event.payload.toolCallId, {
          status: '失败',
          output: event.payload.error.message
        })
        this.clearApproval(event.payload.toolCallId)
        break
      case 'run.state.changed':
        this.status = {
          preparing: '准备',
          streaming: '生成',
          executing_tools: '执行工具',
          finalizing: '保存',
          completed: '完成',
          aborted: '已停止',
          failed: '失败'
        }[event.payload.state]
        break
      case 'run.steering.consumed':
        this.queue = this.queue.filter((i) => i.id !== event.payload.queueItemId)
        break
      case 'run.steering.returned':
        this.queue = this.queue.map((i) =>
          event.payload.queueItemIds.includes(i.id) ? { ...i, mode: 'returned' } : i
        )
        break
      case 'run.completed':
        this.usage = event.payload.usage
        this.status = '完成'
        break
      case 'run.failed':
        this.notice = event.payload.error.message
        this.status = '失败'
        break
      case 'run.aborted':
        this.status = '已停止'
        break
    }
    this.trim()
    this.onChange(immediate)
  }

  resolveApproval(confirmation: ToolConfirmation): void {
    if ((this.approvalVersions.get(confirmation.confirmationId) ?? 0) >= confirmation.version) return
    this.approvalVersions.set(confirmation.confirmationId, confirmation.version)
    this.interactions = this.interactions.filter(i => (
      i.kind !== 'approval' || i.payload.confirmationId !== confirmation.confirmationId
    ))
    const tool = this.tools.get(confirmation.toolCallId)
    const awaitingAnotherRound = this.interactions.some(i => i.kind === 'approval' && i.payload.toolCallId === confirmation.toolCallId)
    if (!awaitingAnotherRound && (!tool || ['准备', '等待审批', '已批准'].includes(tool.status))) {
      this.updateTool(confirmation.toolCallId, {
        name: confirmation.name,
        status: { pending: '等待审批', approved: '已批准', denied: '已拒绝', expired: '已过期', cancelled: '已取消' }[confirmation.status]
      })
    }
  }

  clearApproval(id: string): void {
    this.interactions = this.interactions.filter(
      (i) => i.kind !== 'approval' || i.payload.toolCallId !== id
    )
  }

  private updateTool(id: string, patch: Partial<TuiTool>): void {
    this.tools.set(id, {
      name: id,
      status: '准备',
      output: '',
      ...this.tools.get(id),
      ...patch
    })
  }

  private trim(): void {
    const turns = this.messages.flatMap((m, i) => (m.body.role === 'user' ? [i] : []))
    if (turns.length > 20) {
      this.messages = this.messages.slice(turns[turns.length - 15])
      this.trimmed = true
      const visibleIds = new Set(
        this.messages.flatMap((m) => m.body.toolCalls?.map((t) => t.id) ?? [])
      )
      for (const id of this.tools.keys()) if (!visibleIds.has(id)) this.tools.delete(id)
    }
  }
}
