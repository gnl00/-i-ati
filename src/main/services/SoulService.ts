import DatabaseService from '@main/services/DatabaseService'
import { defaultSoulPrompt } from '@shared/prompts/soul'

export const SOUL_CONFIG_KEY = 'agent_soul_markdown'

const MAX_SOUL_LENGTH = 8_000
export type SoulValidationResult =
  | { valid: true; normalizedContent: string }
  | { valid: false; error: string }

const normalizeSoulContent = (content: string): string => {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export class SoulService {
  getSoul(): { content: string; source: 'config' | 'default' } {
    const configValue = DatabaseService.getConfigValue(SOUL_CONFIG_KEY)
    const normalized = typeof configValue === 'string'
      ? normalizeSoulContent(configValue)
      : ''

    if (normalized) {
      return {
        content: normalized,
        source: 'config'
      }
    }

    return {
      content: defaultSoulPrompt,
      source: 'default'
    }
  }

  validateSoulContent(content: string): SoulValidationResult {
    const normalizedContent = normalizeSoulContent(content)

    if (!normalizedContent) {
      return { valid: false, error: 'Soul content cannot be empty.' }
    }

    if (normalizedContent.length > MAX_SOUL_LENGTH) {
      return { valid: false, error: `Soul content is too long. Maximum length is ${MAX_SOUL_LENGTH} characters.` }
    }

    return {
      valid: true,
      normalizedContent
    }
  }

  saveSoul(content: string): { content: string } {
    const validation = this.validateSoulContent(content)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    DatabaseService.saveConfigValue(SOUL_CONFIG_KEY, validation.normalizedContent)
    return { content: validation.normalizedContent }
  }

  resetSoul(): { content: string } {
    DatabaseService.saveConfigValue(SOUL_CONFIG_KEY, defaultSoulPrompt)
    return { content: defaultSoulPrompt }
  }
}

export const soulService = new SoulService()
