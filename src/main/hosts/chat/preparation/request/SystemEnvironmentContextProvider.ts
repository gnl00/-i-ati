import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

type SystemEnvironmentSnapshot = {
  currentDate: string
  currentTime: string
  timezone: string
  operatingSystem: {
    platform: string
    arch: string
  }
  workspacePath: string
}

const pad = (value: number): string => String(value).padStart(2, '0')

const formatLocalDate = (date: Date): string => [
  date.getFullYear(),
  pad(date.getMonth() + 1),
  pad(date.getDate())
].join('-')

const formatLocalISOString = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const offsetHours = pad(Math.floor(absMinutes / 60))
  const offsetMins = pad(absMinutes % 60)

  return [
    `${formatLocalDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `${sign}${offsetHours}:${offsetMins}`
  ].join('')
}

export class SystemEnvironmentContextProvider {
  build(input: {
    workspacePath: string
    now?: Date
  }): ChatMessage {
    const now = input.now ?? new Date()
    const snapshot: SystemEnvironmentSnapshot = {
      currentDate: formatLocalDate(now),
      currentTime: formatLocalISOString(now),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      operatingSystem: {
        platform: typeof process !== 'undefined' ? process.platform : 'unknown',
        arch: typeof process !== 'undefined' ? process.arch : 'unknown'
      },
      workspacePath: input.workspacePath
    }

    return {
      role: 'user',
      source: MESSAGE_SOURCE.SYSTEM_PROMPT,
      content: [
        '<system-environment>',
        JSON.stringify(snapshot, null, 2),
        '</system-environment>'
      ].join('\n'),
      segments: []
    }
  }
}
