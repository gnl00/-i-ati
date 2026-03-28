import { app } from 'electron'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

const USER_INFO_FILE = 'user-info.md'
const MAX_NAME_LENGTH = 80
const MAX_PREFERRED_ADDRESS_LENGTH = 80
const MAX_BASIC_INFO_LENGTH = 500
const MAX_PREFERENCES_LENGTH = 500

const DEFAULT_USER_INFO: UserInfo = {
  name: '',
  preferredAddress: '',
  basicInfo: '',
  preferences: '',
  updatedAt: 0
}

const parseFrontmatter = (content: string): Partial<UserInfo> => {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!match) {
    return {}
  }

  const parsed: Partial<UserInfo> = {}
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim() as keyof UserInfo
    const rawValue = line.slice(separatorIndex + 1).trim()

    if (!rawValue) {
      continue
    }

    try {
      const parsedValue = JSON.parse(rawValue)
      if (typeof parsedValue === 'string' || typeof parsedValue === 'number') {
        ;(parsed as any)[key] = parsedValue
      }
    } catch {
      ;(parsed as any)[key] = rawValue
    }
  }

  return parsed
}

const normalizeString = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}

const normalizeUpdatedAt = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export const normalizeUserInfo = (info?: Partial<UserInfo>): UserInfo => ({
  name: normalizeString(info?.name, MAX_NAME_LENGTH),
  preferredAddress: normalizeString(info?.preferredAddress, MAX_PREFERRED_ADDRESS_LENGTH),
  basicInfo: normalizeString(info?.basicInfo, MAX_BASIC_INFO_LENGTH),
  preferences: normalizeString(info?.preferences, MAX_PREFERENCES_LENGTH),
  updatedAt: normalizeUpdatedAt(info?.updatedAt)
})

export const isUserInfoEmpty = (info: UserInfo): boolean => {
  return !info.name && !info.preferredAddress && !info.basicInfo && !info.preferences
}

const serializeUserInfo = (info: UserInfo): string => {
  return [
    '---',
    `name: ${JSON.stringify(info.name ?? '')}`,
    `preferredAddress: ${JSON.stringify(info.preferredAddress ?? '')}`,
    `basicInfo: ${JSON.stringify(info.basicInfo ?? '')}`,
    `preferences: ${JSON.stringify(info.preferences ?? '')}`,
    `updatedAt: ${JSON.stringify(info.updatedAt ?? 0)}`,
    '---',
    '',
    '# User Info',
    '',
    'This file stores the stable global user profile used for prompt injection.',
    ''
  ].join('\n')
}

const atomicWriteTextFile = async (filePath: string, content: string): Promise<void> => {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpFilePath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await fs.writeFile(tmpFilePath, content, 'utf-8')
  await fs.rename(tmpFilePath, filePath)
}

export interface UserInfoRecord {
  info: UserInfo
  isEmpty: boolean
  exists: boolean
  filePath: string
}

export class UserInfoService {
  constructor(
    private readonly getUserDataPath: () => string = () => app.getPath('userData')
  ) {}

  resolveFilePath(): string {
    return path.join(this.getUserDataPath(), USER_INFO_FILE)
  }

  async getUserInfo(): Promise<UserInfoRecord> {
    const filePath = this.resolveFilePath()
    const exists = existsSync(filePath)

    if (!exists) {
      await atomicWriteTextFile(filePath, serializeUserInfo(DEFAULT_USER_INFO))
      return {
        info: DEFAULT_USER_INFO,
        isEmpty: true,
        exists: false,
        filePath
      }
    }

    const content = await fs.readFile(filePath, 'utf-8')
    const info = normalizeUserInfo(parseFrontmatter(content))
    return {
      info,
      isEmpty: isUserInfoEmpty(info),
      exists: true,
      filePath
    }
  }

  async setUserInfo(nextInfo: Partial<UserInfo>): Promise<UserInfoRecord> {
    const normalized = {
      ...normalizeUserInfo(nextInfo),
      updatedAt: Date.now()
    }

    await atomicWriteTextFile(this.resolveFilePath(), serializeUserInfo(normalized))

    return {
      info: normalized,
      isEmpty: isUserInfoEmpty(normalized),
      exists: true,
      filePath: this.resolveFilePath()
    }
  }
}

export default new UserInfoService()
