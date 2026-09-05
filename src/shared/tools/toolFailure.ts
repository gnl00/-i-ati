export type ToolFailureCategory = 'input' | 'policy' | 'operation' | 'environment' | 'internal'

export type ToolFailureRecoveryAction =
  | 'correct_input'
  | 'change_strategy'
  | 'check_environment'
  | 'check_state'
  | 'limited_retry'
  | 'stop'

export type ToolFailureTermination = 'timeout' | 'signal' | 'cancelled'

export interface ToolFailureRecovery {
  action: ToolFailureRecoveryAction
  message: string
}

export interface ToolFailure {
  category: ToolFailureCategory
  code: string
  message: string
  recovery: ToolFailureRecovery
  termination?: ToolFailureTermination
  sourceCode?: string | number
}

export type CreateToolFailureInput = ToolFailure

export const createToolFailure = (input: CreateToolFailureInput): ToolFailure => ({
  category: input.category,
  code: input.code,
  message: input.message,
  recovery: input.recovery,
  ...(input.termination ? { termination: input.termination } : {}),
  ...(input.sourceCode !== undefined ? { sourceCode: input.sourceCode } : {})
})

export const isToolFailure = (value: unknown): value is ToolFailure => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ToolFailure> & { recovery?: Partial<ToolFailureRecovery> }
  const categories: ToolFailureCategory[] = ['input', 'policy', 'operation', 'environment', 'internal']
  const recoveryActions: ToolFailureRecoveryAction[] = [
    'correct_input',
    'change_strategy',
    'check_environment',
    'check_state',
    'limited_retry',
    'stop'
  ]
  const terminations: ToolFailureTermination[] = ['timeout', 'signal', 'cancelled']
  return (
    categories.includes(candidate.category as ToolFailureCategory)
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && recoveryActions.includes(candidate.recovery?.action as ToolFailureRecoveryAction)
    && typeof candidate.recovery?.message === 'string'
    && (candidate.termination === undefined || terminations.includes(candidate.termination))
  )
}
