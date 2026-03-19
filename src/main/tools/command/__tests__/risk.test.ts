import { describe, expect, it } from 'vitest'
import {
  assessCommandRisk,
  assessExecuteCommandReview,
  normalizeRiskScore,
  riskLevelFromScore
} from '../risk'

describe('command risk helpers', () => {
  it('normalizes risk score into 0-10 range', () => {
    expect(normalizeRiskScore(-3)).toBe(0)
    expect(normalizeRiskScore(3.6)).toBe(4)
    expect(normalizeRiskScore(14)).toBe(10)
    expect(normalizeRiskScore(undefined)).toBe(0)
  })

  it('maps risk score to risk level', () => {
    expect(riskLevelFromScore(0)).toBe('safe')
    expect(riskLevelFromScore(4)).toBe('warning')
    expect(riskLevelFromScore(7)).toBe('dangerous')
  })

  it('detects dangerous commands from local patterns', () => {
    const result = assessCommandRisk('rm -rf /tmp/demo')
    expect(result.level).toBe('dangerous')
    expect(result.reason).toBeTruthy()
  })

  it('escalates to warning when llm risk score is high even without pattern match', () => {
    const result = assessExecuteCommandReview({
      command: 'git clean -fd',
      possible_risk: 'This may remove untracked local files.',
      risk_score: 5
    })

    expect(result.level).toBe('warning')
    expect(result.normalizedRiskScore).toBe(5)
    expect(result.reason).toContain('This may remove untracked local files.')
  })

  it('keeps local pattern risk as the stronger source of truth', () => {
    const result = assessExecuteCommandReview({
      command: 'rm -rf /Users/demo',
      possible_risk: 'Low risk according to the model.',
      risk_score: 1
    })

    expect(result.level).toBe('dangerous')
    expect(result.patternReason).toBeTruthy()
    expect(result.reason).toContain('Local rule matched:')
  })
})
