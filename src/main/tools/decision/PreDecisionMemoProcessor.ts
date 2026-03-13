import { app } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'

type PreDecisionMemoArgs = {
  action: string
  trigger: string
  value_score: number
  confidence: number
  main_risk: string
  user_authorization_needed: boolean
  user_authorization_confirmed?: boolean
  cost?: string
  alternatives?: string
  mitigation?: string
  chat_uuid?: string
}

type MemoStatus = 'APPROVED' | 'FLAGGED' | 'BLOCKED'

const DECISION_ROOT = 'memories'
const DECISION_LOG_FILE = 'decision-log.md'

const isScoreInRange = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10

const ensureNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const getDateStamp = (timestamp: number): string => {
  const d = new Date(timestamp)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

const getTimeStamp = (timestamp: number): string => {
  const d = new Date(timestamp)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

const buildMemoId = (timestamp: number): string => {
  const datePart = getDateStamp(timestamp)
  const rand = Math.random().toString(36).slice(2, 6)
  return `memo_${datePart}_${rand}`
}

const resolveDecisionLogPath = (chatUuid?: string): string => {
  const scope = chatUuid || '_global'
  return path.join(app.getPath('userData'), DECISION_ROOT, scope, 'decision', DECISION_LOG_FILE)
}

const appendDecisionLog = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, content, 'utf-8')
}

const buildMemoMarkdown = (
  memoId: string,
  createdAt: number,
  args: PreDecisionMemoArgs,
  status: MemoStatus,
  flags: string[]
): string => {
  const lines = [
    `## ${memoId}`,
    '',
    `- created_at: ${getTimeStamp(createdAt)}`,
    `- status: ${status}`,
    `- flags: ${flags.length > 0 ? flags.join(', ') : 'none'}`,
    `- action: ${args.action.trim()}`,
    `- trigger: ${args.trigger.trim()}`,
    `- value_score: ${args.value_score}`,
    `- confidence: ${args.confidence}`,
    `- user_authorization_needed: ${args.user_authorization_needed ? 'true' : 'false'}`,
    `- user_authorization_confirmed: ${args.user_authorization_confirmed ? 'true' : 'false'}`,
    `- main_risk: ${args.main_risk.trim()}`,
    `- cost: ${args.cost?.trim() || 'n/a'}`,
    `- alternatives: ${args.alternatives?.trim() || 'n/a'}`,
    `- mitigation: ${args.mitigation?.trim() || 'n/a'}`,
    ''
  ]
  return `${lines.join('\n')}\n`
}

const evaluateMemo = (args: PreDecisionMemoArgs): {
  status: MemoStatus
  flags: string[]
  requiresUserConfirmation: boolean
  reason: string
  suggestedAction: string
} => {
  const flags: string[] = []

  if (args.confidence <= 5) {
    flags.push('CONFIDENCE_LOW')
  }
  if (args.value_score <= 3) {
    flags.push('VALUE_LOW')
  }
  if (args.user_authorization_needed && !args.user_authorization_confirmed) {
    flags.push('NEEDS_USER_CONFIRMATION')
  }
  if (args.main_risk.trim().length > 0 && args.confidence <= 6 && !ensureNonEmptyString(args.mitigation)) {
    flags.push('HIGH_RISK_NO_MITIGATION')
  }

  if (flags.includes('HIGH_RISK_NO_MITIGATION')) {
    return {
      status: 'BLOCKED',
      flags,
      requiresUserConfirmation: false,
      reason: 'High risk with insufficient mitigation under low confidence.',
      suggestedAction: 'Add a concrete mitigation plan or gather more information before execution.'
    }
  }

  if (flags.length > 0) {
    return {
      status: 'FLAGGED',
      flags,
      requiresUserConfirmation: true,
      reason: `Decision requires user confirmation due to: ${flags.join(', ')}`,
      suggestedAction: 'Pause execution and ask the user for explicit confirmation.'
    }
  }

  return {
    status: 'APPROVED',
    flags,
    requiresUserConfirmation: false,
    reason: 'Decision meets current pre-decision checks.',
    suggestedAction: 'Proceed with execution.'
  }
}

export async function processPreDecisionMemoCreate(args: PreDecisionMemoArgs): Promise<{
  success: boolean
  memo_id?: string
  status?: MemoStatus
  reason: string
  requires_user_confirmation: boolean
  suggested_action?: string
  file_path?: string
}> {
  try {
    if (!ensureNonEmptyString(args.action)) {
      return {
        success: false,
        reason: 'missing required param: action',
        requires_user_confirmation: false
      }
    }
    if (!ensureNonEmptyString(args.trigger)) {
      return {
        success: false,
        reason: 'missing required param: trigger',
        requires_user_confirmation: false
      }
    }
    if (!isScoreInRange(args.value_score)) {
      return {
        success: false,
        reason: 'invalid param type: value_score (expected number 1-10)',
        requires_user_confirmation: false
      }
    }
    if (!isScoreInRange(args.confidence)) {
      return {
        success: false,
        reason: 'invalid param type: confidence (expected number 1-10)',
        requires_user_confirmation: false
      }
    }
    if (!ensureNonEmptyString(args.main_risk)) {
      return {
        success: false,
        reason: 'missing required param: main_risk',
        requires_user_confirmation: false
      }
    }
    if (typeof args.user_authorization_needed !== 'boolean') {
      return {
        success: false,
        reason: 'invalid param type: user_authorization_needed (expected boolean)',
        requires_user_confirmation: false
      }
    }

    const createdAt = Date.now()
    const memoId = buildMemoId(createdAt)
    const decision = evaluateMemo(args)
    const filePath = resolveDecisionLogPath(args.chat_uuid)
    const markdown = buildMemoMarkdown(memoId, createdAt, args, decision.status, decision.flags)
    await appendDecisionLog(filePath, markdown)

    return {
      success: true,
      memo_id: memoId,
      status: decision.status,
      reason: decision.reason,
      requires_user_confirmation: decision.requiresUserConfirmation,
      suggested_action: decision.suggestedAction,
      file_path: filePath
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      reason: `Failed to create pre-decision memo: ${message}`,
      requires_user_confirmation: false
    }
  }
}
