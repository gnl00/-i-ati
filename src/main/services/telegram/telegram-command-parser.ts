export type TelegramCommandName =
  | 'newchat'
  | 'models'
  | 'model'
  | 'tools'
  | 'workspace'
  | 'status'
  | 'help'

export type TelegramCommand = {
  name: TelegramCommandName
  args: string
  raw: string
}

export type TelegramCommandCallback =
  | { type: 'models'; page: number }
  | { type: 'tools'; page: number }

const KNOWN_COMMANDS = new Set<TelegramCommandName>([
  'newchat',
  'models',
  'model',
  'tools',
  'workspace',
  'status',
  'help'
])

export const parseTelegramCommand = (
  text: string,
  botUsername?: string
): TelegramCommand | null => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) {
    return null
  }

  const [rawCommand, ...rest] = trimmed.split(/\s+/)
  const commandToken = rawCommand.slice(1)
  const [namePart, usernamePart] = commandToken.split('@')
  const normalizedName = namePart.toLowerCase() as TelegramCommandName

  if (!KNOWN_COMMANDS.has(normalizedName)) {
    return null
  }

  if (
    usernamePart
    && botUsername
    && usernamePart.toLowerCase() !== botUsername.toLowerCase()
  ) {
    return null
  }

  return {
    name: normalizedName,
    args: rest.join(' ').trim(),
    raw: trimmed
  }
}

export const parseTelegramCommandCallback = (value: string): TelegramCommandCallback | null => {
  const parts = value.split(':')
  if (parts.length !== 3 || parts[0] !== 'tgcmd') {
    return null
  }

  const page = Number(parts[2])
  if (!Number.isInteger(page) || page < 0) {
    return null
  }

  if (parts[1] === 'models') {
    return { type: 'models', page }
  }

  if (parts[1] === 'tools') {
    return { type: 'tools', page }
  }

  return null
}
