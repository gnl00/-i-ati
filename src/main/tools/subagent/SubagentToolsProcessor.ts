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
}

const SUBAGENT_ACTIONS: SubagentAction[] = ['spawn', 'wait']

export async function processSubagent(
  args: unknown = {}
): Promise<SubagentResponse> {
  const normalizedArgs = args && typeof args === 'object' && !Array.isArray(args)
    ? args as Partial<Record<'action' | 'task' | 'role' | 'context_mode' | 'files' | 'background' | 'subagent_id' | 'timeout_seconds' | 'chat_uuid' | 'model_ref' | 'parent_submission_id' | 'permission_approval_mode', unknown>>
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

  switch (action as SubagentAction) {
    case 'spawn':
      return processSubagentSpawn(normalizedArgs as unknown as SubagentSpawnArgs)
    case 'wait':
      return processSubagentWait(normalizedArgs as unknown as SubagentWaitArgs)
  }
}

const clampTimeoutSeconds = (value?: number): number => {
  if (!Number.isFinite(value)) return 30
  return Math.min(Math.max(Math.floor(value as number), 0), 300)
}

export async function processSubagentSpawn(
  args: SubagentSpawnArgs
): Promise<SubagentSpawnResponse> {
  const task = args.task?.trim()
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

  const record = await subagentRunService.spawn({
    task,
    role: args.role || 'general',
    contextMode: args.context_mode || 'current_chat_summary',
    files: Array.isArray(args.files) ? args.files.map(file => file.trim()).filter(Boolean) : [],
    chatUuid: args.chat_uuid,
    modelRef: args.model_ref,
    parentSubmissionId: args.parent_submission_id,
    permissionApprovalMode: normalizePermissionApprovalMode(args.permission_approval_mode)
  })

  return {
    success: true,
    subagent: record,
    message: 'Subagent spawned in background.'
  }
}

export async function processSubagentWait(
  args: SubagentWaitArgs
): Promise<SubagentWaitResponse> {
  const subagentId = args.subagent_id?.trim()
  if (!subagentId) {
    return {
      success: false,
      message: 'subagent_id is required'
    }
  }

  const record = await subagentRunService.wait(subagentId, clampTimeoutSeconds(args.timeout_seconds) * 1000)
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

  if (record.status === 'failed' || record.status === 'cancelled') {
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
