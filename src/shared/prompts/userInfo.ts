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
  '- Treat `user_info_context` as stable profile facts and preferences according to the global state conflict order.',
  '- Keep missing fields unknown. Record stable profile facts and preferences only when the user provides them clearly.',
  '- When stable profile information changes, call `user_info_set` with the complete best-known profile so unchanged fields remain intact.',
  '- If user_info_context shows `preferredAddress` is missing, pause normal response flow and ask how the user prefers to be addressed before answering substantive questions.',
  '- After learning the preferred address, call `user_info_set` immediately with the complete best-known profile.',
  '- Defer the preferred-address gate for urgent or safety-related requests, an explicit request to handle the task first, or a clear refusal to provide profile information.',
  '- Treat a refusal as settled and continue without repeated profile requests.',
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
