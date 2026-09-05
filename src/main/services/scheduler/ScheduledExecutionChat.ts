import fs from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDefaultWorkspacePath } from '@shared/workspace/workspacePaths'
import { normalizePermissionApprovalMode } from '@tools/approval'
import type { ScheduledTaskRow } from '@main/db/dao/ScheduledTaskDao'

export class ScheduledExecutionChatCancelledError extends Error {
  constructor() {
    super('Scheduled execution was cancelled before chat creation')
    this.name = 'ScheduledExecutionChatCancelledError'
  }
}

export type ScheduledExecutionChatInput = {
  task: Pick<ScheduledTaskRow, 'goal'>
  scheduledFor: number
  attempt: number
  sourceChat: Pick<ChatEntity, 'workspacePath' | 'permissionApprovalMode'>
  modelRef: ModelRef
  canContinue?: () => boolean
}

function resolveWorkspaceDirectory(workspacePath: string): string {
  if (isAbsolute(workspacePath)) return resolve(workspacePath)
  const normalized = workspacePath.replace(/\\/g, '/')
  const clean = normalized.startsWith('./') ? normalized.slice(2) : normalized
  return resolve(join(app.getPath('userData'), clean))
}

function shortGoal(goal: string): string {
  const normalized = goal.trim().replace(/\s+/g, ' ')
  const codePoints = Array.from(normalized || 'Scheduled task')
  return codePoints.slice(0, 80).join('')
}

export function buildScheduledExecutionChatTitle(goal: string, scheduledFor: number, attempt: number): string {
  const scheduledAt = Number.isFinite(scheduledFor)
    ? new Date(scheduledFor).toISOString()
    : 'unknown time'
  return `${shortGoal(goal)} · ${scheduledAt} · attempt ${attempt}`
}

export async function createScheduledExecutionChat(input: ScheduledExecutionChatInput): Promise<ChatEntity> {
  const uuid = uuidv4()
  const workspacePath = input.sourceChat.workspacePath || getDefaultWorkspacePath(uuid)
  await fs.mkdir(resolveWorkspaceDirectory(workspacePath), { recursive: true })

  if (input.canContinue && !input.canContinue()) {
    throw new ScheduledExecutionChatCancelledError()
  }

  const now = Date.now()
  const chat: ChatEntity = {
    uuid,
    title: buildScheduledExecutionChatTitle(input.task.goal, input.scheduledFor, input.attempt),
    messages: [],
    msgCount: 0,
    modelRef: { ...input.modelRef },
    workspacePath,
    userInstruction: '',
    permissionApprovalMode: normalizePermissionApprovalMode(input.sourceChat.permissionApprovalMode),
    createTime: now,
    updateTime: now
  }
  return chat
}
