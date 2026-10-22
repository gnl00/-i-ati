import type { EmbeddedToolExecutionContext } from '@shared/tools/registry'
import subagentRunService from '@main/services/subagent/subagent-run-service'
import { normalizePermissionApprovalMode } from '@tools/approval'
import type {
  SubagentAction,
  SubagentResponse,
  SubagentRole,
  SubagentSpawnResponse,
  SubagentWaitResponse
} from '@tools/subagent/index.d'

type SubagentSpawnArgs = {
  task: string
  role?: SubagentRole
  context_mode?: 'minimal' | 'current_chat_summary'
  files?: string[]
  background?: boolean
  chat_uuid?: string
  model_ref?: ModelRef
  parent_submission_id?: string
  permission_approval_mode?: PermissionApprovalMode
}

type SubagentWaitArgs = {
  subagent_id: string
  timeout_seconds?: number
  run_id?: string
  after_revision?: number
}

const SUBAGENT_ACTIONS: SubagentAction[] = ['spawn', 'wait', 'cancel', 'inspect', 'list', 'send_message', 'followup_task', 'resume', 'interrupt']

export async function processSubagent(
  args: unknown = {},
  context?: EmbeddedToolExecutionContext
): Promise<SubagentResponse> {
  const normalizedArgs = args && typeof args === 'object' && !Array.isArray(args)
    ? { ...args } as Partial<Record<'action' | 'task' | 'role' | 'context_mode' | 'files' | 'background' | 'subagent_id' | 'timeout_seconds' | 'chat_uuid' | 'model_ref' | 'parent_submission_id' | 'permission_approval_mode' | 'run_id' | 'message_id' | 'message' | 'after_revision', unknown>>
    : {}
  const action = typeof normalizedArgs.action === 'string' ? normalizedArgs.action.trim() : ''
  if (!action) {
    return { success: false, message: 'Missing required parameter: action' }
  }
  if (!SUBAGENT_ACTIONS.includes(action as SubagentAction)) {
    return {
      success: false,
      message: `Invalid action: ${action}. Expected one of: ${SUBAGENT_ACTIONS.join(', ')}`
    }
  }

  context?.signal?.throwIfAborted()
  if (context) {
    normalizedArgs.chat_uuid = context.chatUuid
    normalizedArgs.parent_submission_id = context.submissionId
  }
  if (action !== 'spawn' && action !== 'list' && context?.chatUuid) {
    const target = typeof normalizedArgs.subagent_id === 'string' ? subagentRunService.get(normalizedArgs.subagent_id.trim()) : null
    if (!target || target.parent_chat_uuid !== context.chatUuid) return { success: false, message: 'Subagent not found in this chat.' }
  }
  switch (action as SubagentAction) {
    case 'list':
      return { success: true, message: 'Subagent records for this chat.', subagents: subagentRunService.list(context?.chatUuid ?? String(normalizedArgs.chat_uuid ?? '')) }
    case 'inspect': {
      const id = typeof normalizedArgs.subagent_id === 'string' ? normalizedArgs.subagent_id.trim() : ''
      const saved = subagentRunService.inspect(id, typeof normalizedArgs.run_id === 'string' ? normalizedArgs.run_id : undefined)
      return saved
        ? { success: true, subagent: saved.record, message: 'Persisted run evidence.', evidence: { transcript: saved.transcriptJson ? JSON.parse(saved.transcriptJson) : null, previous_run_id: (JSON.parse(saved.inputJson) as { previousRunId?: string }).previousRunId, messages: subagentRunService.messagesForRun(saved.record.run_id!) } }
        : { success: false, message: 'Persisted run evidence not found.' }
    }

    case 'spawn':
      return processSubagentSpawn(normalizedArgs as unknown as SubagentSpawnArgs, context)
    case 'wait':
      return processSubagentWait(normalizedArgs as unknown as SubagentWaitArgs, context)
    case 'send_message':
    case 'followup_task':
    case 'resume': {
      const id = typeof normalizedArgs.subagent_id === 'string' ? normalizedArgs.subagent_id.trim() : ''
      const messageId = typeof normalizedArgs.message_id === 'string' ? normalizedArgs.message_id : ''
      const body = action === 'send_message' ? normalizedArgs.message : normalizedArgs.task
      if (!id || !messageId || typeof body !== 'string' || !body.trim()) return { success: false, message: 'subagent_id, message_id and message/task are required.' }
      try {
        if (action === 'send_message') {
          const receipt = subagentRunService.sendMessage(id, messageId, body, context?.chatUuid ?? String(normalizedArgs.chat_uuid ?? 'main'))
          return { success: true, subagent: subagentRunService.get(id)!, message: `Message ${receipt.id} is ${receipt.status}; idle children start only with followup_task or resume.` }
        }
        const subagent = await subagentRunService.followup(id, messageId, body, context?.submissionId, normalizePermissionApprovalMode(normalizedArgs.permission_approval_mode), context?.signal)
        return { success: true, subagent, message: 'Followup accepted; the same message ID returns the existing run on retry.' }
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) }
      }
    }
    case 'interrupt':
    case 'cancel': {
      const id = typeof normalizedArgs.subagent_id === 'string' ? normalizedArgs.subagent_id.trim() : ''
      if (!id) return { success: false, message: 'subagent_id is required' }
      const record = subagentRunService.cancel(id, ...('run_id' in normalizedArgs && typeof normalizedArgs.run_id === 'string' ? ['user_cancelled', normalizedArgs.run_id] : []))
      return record
        ? { success: !['queued', 'running', 'waiting_for_confirmation'].includes(record.status), subagent: record, message: ['queued', 'running', 'waiting_for_confirmation'].includes(record.status) ? 'This task is owned by another app process. Stop it in that instance.' : `Subagent is ${record.status}.` }
        : { success: false, message: 'Subagent not found.' }
    }
  }
}

const clampTimeoutSeconds = (value?: number): number => {
  if (!Number.isFinite(value)) return 30
  return Math.min(Math.max(Math.floor(value as number), 0), 300)
}

export async function processSubagentSpawn(
  args: SubagentSpawnArgs,
  context?: EmbeddedToolExecutionContext
): Promise<SubagentSpawnResponse> {
  const task = typeof args.task === 'string' ? args.task.trim() : ''
  if (!task) {
    return {
      success: false,
      message: 'task is required'
    }
  }

  if (!args.model_ref) {
    return {
      success: false,
      message: 'model_ref is required'
    }
  }

  try {
    const record = await subagentRunService.spawn({
      task,
      role: args.role || 'general',
      contextMode: args.context_mode || 'current_chat_summary',
      files: Array.isArray(args.files)
        ? args.files.filter((file): file is string => typeof file === 'string').map(file => file.trim()).filter(Boolean)
        : [],
      chatUuid: args.chat_uuid,
      modelRef: args.model_ref,
      parentSubmissionId: args.parent_submission_id,
      permissionApprovalMode: normalizePermissionApprovalMode(args.permission_approval_mode),
      ...(context?.signal ? { signal: context.signal } : {})
    })

    return {
      success: true,
      subagent: record,
      message: 'Subagent spawned in background.'
    }
  } catch (error) {
    context?.signal?.throwIfAborted()
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function processSubagentWait(
  args: SubagentWaitArgs,
  context?: EmbeddedToolExecutionContext
): Promise<SubagentWaitResponse> {
  const subagentId = typeof args.subagent_id === 'string' ? args.subagent_id.trim() : ''
  if (args.after_revision !== undefined && (!Number.isInteger(args.after_revision) || args.after_revision < 0)) return { success: false, message: 'after_revision must be a non-negative integer.' }
  if (!subagentId) {
    return {
      success: false,
      message: 'subagent_id is required'
    }
  }

  if (args.run_id && subagentRunService.get(subagentId)?.run_id !== args.run_id) {
    const saved = subagentRunService.inspect(subagentId, args.run_id)
    return saved ? { success: !['failed', 'cancelled', 'interrupted'].includes(saved.record.status), subagent: saved.record, message: `Subagent run is ${saved.record.status}.` } : { success: false, message: 'Subagent run not found.' }
  }
  const record = args.after_revision !== undefined
    ? await subagentRunService.wait(subagentId, clampTimeoutSeconds(args.timeout_seconds) * 1000, context?.signal, Math.max(0, Math.floor(args.after_revision)))
    : await subagentRunService.wait(subagentId, clampTimeoutSeconds(args.timeout_seconds) * 1000, ...(context?.signal ? [context.signal] : []))
  if (!record) {
    return {
      success: false,
      message: 'Subagent not found.'
    }
  }

  if (record.status === 'completed') {
    return {
      success: true,
      subagent: record,
      message: 'Subagent completed.'
    }
  }

  if (record.status === 'failed' || record.status === 'cancelled' || record.status === 'interrupted') {
    return {
      success: false,
      subagent: record,
      message: record.error || `Subagent ${record.status}.`
    }
  }

  return {
    success: true,
    subagent: record,
    message: `Subagent is still ${record.status}.`
  }
}
