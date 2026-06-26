type PromptTelegramHostInfo = {
  enabled?: boolean
  botUsername?: string
  botId?: string
  mode?: 'polling' | 'webhook'
  proactiveMessagingAvailable?: boolean
}

type UserInfoRuntime = {
  telegram?: PromptTelegramHostInfo
}

type UserInfoContextSnapshot = {
  profile: {
    name: string | null
    preferredAddress: string | null
    basicInfo: string | null
    preferences: string | null
  }
  completeness: {
    hasCoreUserInfo: boolean
    hasPreferredAddress: boolean
  }
  telegram?: {
    enabled: boolean
    botUsername: string | null
    botId: string | null
    mode: 'polling' | 'webhook' | null
    proactiveMessagingAvailable: boolean
  }
}

const normalizeValue = (value?: string): string | null => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const hasPreferredAddress = (info?: UserInfo): boolean => {
  return Boolean(info?.preferredAddress?.trim())
}

const hasCoreUserInfo = (info?: UserInfo): boolean => {
  if (!info) {
    return false
  }

  return [
    info.name,
    info.preferredAddress,
    info.basicInfo,
    info.preferences
  ].some(value => Boolean(value?.trim()))
}

const hasTelegramRuntimeInfo = (telegram?: PromptTelegramHostInfo): boolean => Boolean(
  telegram?.enabled
  || telegram?.botUsername?.trim()
  || telegram?.botId?.trim()
  || telegram?.mode
)

export const buildUserInfoSystemPrompt = (): string => [
  '<user_info_system>',
  '## [P0] User Info Policy',
  '',
  '### Priority',
  '- Safety constraints override everything else.',
  '- The current user message in this turn overrides older stored user info.',
  '- Stable user_info overrides general default assistant style and house-style preferences.',
  '',
  '### Usage',
  '- Treat injected user_info_context fields as stable facts or stable preferences unless the user explicitly updates them.',
  '- Do not invent missing user info. Unknown means unknown.',
  '- Telegram proactive messaging requires resolving a reachable Telegram target before sending.',
  '',
  '### Hard Gate: Missing Preferred Address',
  '- If user_info_context shows `preferredAddress` is missing, pause normal response flow and ask how the user prefers to be addressed before answering substantive questions.',
  '- After the user answers, call `user_info_set` immediately with the complete best-known profile.',
  '- You may defer this only if the user request is urgent or safety-related, if the user explicitly asks you to handle the task first, or if the user clearly refuses to provide profile information.',
  '- If the user refuses to provide profile info, respect that and stop repeatedly asking.',
  '',
  '### Maintenance',
  '- When the user clearly provides new stable profile facts or preference changes, update the full profile with `user_info_set`.',
  '- If core user info is incomplete, ask concise questions to learn the user’s preferred address first, then gather stable basic info and stable preferences.',
  '- After learning them, call `user_info_set` with the complete best-known profile so future turns can use it.',
  '</user_info_system>'
].join('\n')

export const buildUserInfoContextContent = (
  info?: UserInfo,
  runtime?: UserInfoRuntime
): string => {
  const telegram = runtime?.telegram
  const snapshot: UserInfoContextSnapshot = {
    profile: {
      name: normalizeValue(info?.name),
      preferredAddress: normalizeValue(info?.preferredAddress),
      basicInfo: normalizeValue(info?.basicInfo),
      preferences: normalizeValue(info?.preferences)
    },
    completeness: {
      hasCoreUserInfo: hasCoreUserInfo(info),
      hasPreferredAddress: hasPreferredAddress(info)
    },
    telegram: hasTelegramRuntimeInfo(telegram)
      ? {
          enabled: Boolean(telegram?.enabled),
          botUsername: normalizeValue(telegram?.botUsername),
          botId: normalizeValue(telegram?.botId),
          mode: telegram?.mode ?? null,
          proactiveMessagingAvailable: Boolean(telegram?.proactiveMessagingAvailable)
        }
      : undefined
  }

  return [
    '<user_info_context>',
    JSON.stringify(snapshot, null, 2),
    '</user_info_context>'
  ].join('\n')
}

export const buildUserInfoPrompt = (
  info?: UserInfo,
  runtime?: UserInfoRuntime
): string => [
  buildUserInfoSystemPrompt(),
  buildUserInfoContextContent(info, runtime)
].join('\n\n')
