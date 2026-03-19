import type { ExecuteCommandArgs, RiskLevel } from '@tools/command/index.d'

export const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+-rf\s+[\/~]/i, reason: 'Recursive deletion from root or home directory' },
  { pattern: /rm\s+-rf\s+\*/i, reason: 'Recursive deletion with wildcard' },
  { pattern: /rm\s+.*\s+-rf/i, reason: 'Recursive file deletion' },
  { pattern: /dd\s+if=/i, reason: 'Direct disk write operation' },
  { pattern: /mkfs/i, reason: 'File system formatting' },
  { pattern: /fdisk/i, reason: 'Disk partitioning' },
  { pattern: />\s*\/dev\/(sd|hd|nvme)/i, reason: 'Writing to disk device' },
  { pattern: /chmod\s+-R\s+777/i, reason: 'Setting world-writable permissions recursively' },
  { pattern: /chown\s+-R/i, reason: 'Changing ownership recursively' },
  { pattern: /sudo\s+rm/i, reason: 'Deleting files with sudo' },
  { pattern: /sudo\s+dd/i, reason: 'Disk operation with sudo' },
  { pattern: /rm.*\/etc/i, reason: 'Deleting system configuration files' },
  { pattern: /rm.*\/usr/i, reason: 'Deleting system binaries' },
  { pattern: /rm.*\/var/i, reason: 'Deleting system data' },
  { pattern: /:\(\)\{.*:\|:.*\};:/i, reason: 'Fork bomb detected' },
  { pattern: /while\s+true.*do/i, reason: 'Infinite loop detected' }
] as const

export const WARNING_PATTERNS = [
  { pattern: /rm\s+-r/i, reason: 'Recursive deletion' },
  { pattern: /rm\s+.*\*/i, reason: 'Deletion with wildcard' },
  { pattern: /git\s+push\s+.*--force/i, reason: 'Force push to git repository' },
  { pattern: /npm\s+publish/i, reason: 'Publishing to npm registry' },
  { pattern: /curl.*\|\s*bash/i, reason: 'Executing downloaded script' },
  { pattern: /wget.*\|\s*sh/i, reason: 'Executing downloaded script' },
  { pattern: />\s*\/dev\/null/i, reason: 'Redirecting to /dev/null' }
] as const

const RISK_LEVEL_PRIORITY: Record<RiskLevel, number> = {
  safe: 0,
  warning: 1,
  dangerous: 2
}

export type ExecuteCommandReviewAssessment = {
  level: RiskLevel
  reason?: string
  patternReason?: string
  possibleRisk?: string
  normalizedRiskScore: number
}

export function assessCommandRisk(command: string): { level: RiskLevel; reason?: string } {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      console.log(`[CommandExecutor] Dangerous command detected: ${reason}`)
      return { level: 'dangerous', reason }
    }
  }

  for (const { pattern, reason } of WARNING_PATTERNS) {
    if (pattern.test(command)) {
      console.log(`[CommandExecutor] Warning command detected: ${reason}`)
      return { level: 'warning', reason }
    }
  }

  return { level: 'safe' }
}

export function normalizeRiskScore(score: unknown): number {
  if (typeof score !== 'number' || Number.isNaN(score) || !Number.isFinite(score)) {
    return 0
  }
  return Math.max(0, Math.min(10, Math.round(score)))
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 7) return 'dangerous'
  if (score >= 4) return 'warning'
  return 'safe'
}

function maxRiskLevel(left: RiskLevel, right: RiskLevel): RiskLevel {
  return RISK_LEVEL_PRIORITY[left] >= RISK_LEVEL_PRIORITY[right] ? left : right
}

function buildCombinedReason(patternReason?: string, possibleRisk?: string): string | undefined {
  const risk = possibleRisk?.trim()
  if (patternReason && risk) {
    return `${risk} Local rule matched: ${patternReason}.`
  }
  return patternReason || risk
}

export function assessExecuteCommandReview(
  args: Pick<ExecuteCommandArgs, 'command' | 'possible_risk' | 'risk_score'>
): ExecuteCommandReviewAssessment {
  const patternAssessment = assessCommandRisk(args.command)
  const normalizedRiskScore = normalizeRiskScore(args.risk_score)
  const scoreLevel = riskLevelFromScore(normalizedRiskScore)
  const possibleRisk = args.possible_risk?.trim()
  const level = maxRiskLevel(patternAssessment.level, scoreLevel)

  return {
    level,
    reason: buildCombinedReason(patternAssessment.reason, possibleRisk),
    patternReason: patternAssessment.reason,
    possibleRisk,
    normalizedRiskScore
  }
}

