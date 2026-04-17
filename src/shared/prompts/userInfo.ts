const displayValue = (value?: string): string => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'unknown'
}

type PromptTelegramHostInfo = {
  enabled?: boolean
  botUsername?: string
  botId?: string
  mode?: 'polling' | 'webhook'
  proactiveMessagingAvailable?: boolean
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

export const buildUserInfoPrompt = (
  info?: UserInfo,
  runtime?: {
    telegram?: PromptTelegramHostInfo
  }
): string => {
  const hasInfo = hasCoreUserInfo(info)
  const hasAddress = hasPreferredAddress(info)
  const telegram = runtime?.telegram
  const hasTelegramInfo = Boolean(
    telegram?.enabled
    || telegram?.botUsername?.trim()
    || telegram?.botId?.trim()
    || telegram?.mode
  )

  return [
    '<user_info>',
    '## [P0] User Info',
    `- User name: ${displayValue(info?.name)}`,
    `- Preferred address: ${displayValue(info?.preferredAddress)}`,
    `- Basic info: ${displayValue(info?.basicInfo)}`,
    `- Preferences: ${displayValue(info?.preferences)}`,
    hasTelegramInfo
      ? [
          '',
          '### Telegram Host',
          `- Enabled: ${telegram?.enabled ? 'true' : 'false'}`,
          `- Bot username: ${displayValue(telegram?.botUsername)}`,
          `- Bot ID: ${displayValue(telegram?.botId)}`,
          `- Mode: ${telegram?.mode ?? 'unknown'}`,
          `- Proactive messaging: ${telegram?.proactiveMessagingAvailable ? 'available' : 'unavailable'}`
        ].join('\n')
      : '',
    '',
    '### Priority',
    '- Safety constraints override everything else.',
    '- The current user message in this turn overrides older stored user info.',
    '- Stable user_info overrides general default assistant style and house-style preferences.',
    '',
    '### Usage',
    '- Treat the user_info fields above as stable facts or stable preferences unless the user explicitly updates them.',
    '- Do not invent missing user info. Unknown means unknown.',
    '- Telegram proactive messaging requires resolving a reachable Telegram target before sending.',
    '',
    hasAddress
      ? ''
      : [
          '### Hard Gate: Missing Preferred Address',
          '- The critical field `preferredAddress` is missing.',
          '- You MUST pause normal response flow and ask how the user prefers to be addressed before answering substantive questions.',
          '- After the user answers, you MUST call `user_info_set` immediately with the complete best-known profile.',
          '- Do not silently skip or postpone this step.',
          '- Exception: you may defer this only if the user request is urgent or safety-related, if the user explicitly asks you to handle the task first, or if the user clearly refuses to provide profile information.',
          '- If the user refuses to provide profile info, respect that and stop repeatedly asking.'
        ].join('\n'),
    '',
    hasInfo
      ? '### Maintenance\n- When the user clearly provides new stable profile facts or preference changes, update the full profile with `user_info_set`.'
      : [
          '### Missing Info',
          '- Core user info is currently incomplete.',
          '- Ask concise questions to learn the user’s preferred address first, then gather stable basic info and stable preferences.',
          '- After learning them, call `user_info_set` with the complete best-known profile so future turns can use it.'
        ].join('\n'),
    '</user_info>'
  ]
    .filter(Boolean)
    .join('\n')
}
