type RequestOverrideKind =
  | 'chat'
  | 'title'
  | 'smartMessage'
  | 'compression'
  | 'providerTest'
  | 'subagent'

const isPlainObject = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const sanitizeTitleOutputConfigOverride = (value: unknown): unknown => {
  if (!isPlainObject(value)) {
    return value
  }

  const { effort: _effort, ...rest } = value
  return Object.keys(rest).length > 0 ? rest : undefined
}

const resolveTitleOverrides = (
  providerOverrides: Record<string, any>
): ProviderDefinition['requestOverrides'] => {
  const {
    thinking: _thinking,
    reasoning: _reasoning,
    reasoning_effort: _reasoningEffort,
    tool_choice: _toolChoice,
    output_config: outputConfig,
    ...rest
  } = providerOverrides

  const sanitizedOutputConfig = sanitizeTitleOutputConfigOverride(outputConfig)
  const requestOverrides = {
    ...rest,
    ...(sanitizedOutputConfig === undefined ? {} : { output_config: sanitizedOutputConfig })
  }

  return Object.keys(requestOverrides).length > 0 ? requestOverrides : undefined
}

const resolveSmartMessageOverrides = (
  providerOverrides: Record<string, any>
): ProviderDefinition['requestOverrides'] => {
  const { tool_choice: _toolChoice, ...rest } = providerOverrides
  return Object.keys(rest).length > 0 ? rest : undefined
}

export const resolveRequestOverrides = (
  providerOverrides: ProviderDefinition['requestOverrides'],
  requestKind: RequestOverrideKind
): ProviderDefinition['requestOverrides'] => {
  if (!isPlainObject(providerOverrides)) {
    return requestKind === 'title' ? undefined : providerOverrides
  }

  switch (requestKind) {
    case 'title':
      return resolveTitleOverrides(providerOverrides)
    case 'smartMessage':
      return resolveSmartMessageOverrides(providerOverrides)
    case 'compression':
      return resolveTitleOverrides(providerOverrides)
    default:
      return providerOverrides
  }
}

export type { RequestOverrideKind }
