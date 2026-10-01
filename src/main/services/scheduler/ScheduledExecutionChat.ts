import fs from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDefaultWorkspacePath } from '@shared/workspace/workspacePaths'

export class ScheduledExecutionChatCancelledError extends Error {
  constructor() {
    super('Scheduled execution was cancelled before chat creation')
    this.name = 'ScheduledExecutionChatCancelledError'
  }
}

export type ScheduledExecutionChatInput = {
  sourceChat: Pick<ChatEntity, 'workspacePath'>
  modelRef: ModelRef
  canContinue?: () => boolean
}

function resolveWorkspaceDirectory(workspacePath: string): string {
  if (isAbsolute(workspacePath)) return resolve(workspacePath)
  const normalized = workspacePath.replace(/\\/g, '/')
  const clean = normalized.startsWith('./') ? normalized.slice(2) : normalized
  return resolve(join(app.getPath('userData'), clean))
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
    isScheduled: true,
    title: 'NewChat',
    messages: [],
    msgCount: 0,
    modelRef: { ...input.modelRef },
    workspacePath,
    userInstruction: '',
    permissionApprovalMode: 'auto',
    createTime: now,
    updateTime: now
  }
  return chat
}
