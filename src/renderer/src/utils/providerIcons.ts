// Provider icons
import anthropicIcon from '@renderer/assets/provider-icons/anthropic.svg'
import deepseekIcon from '@renderer/assets/provider-icons/deepseek.svg'
import groqIcon from '@renderer/assets/provider-icons/groq.svg'
import moonshotIcon from '@renderer/assets/provider-icons/moonshot.svg'
import ollamaIcon from '@renderer/assets/provider-icons/ollama.svg'
import openaiIcon from '@renderer/assets/provider-icons/openai.svg'
import openrouterIcon from '@renderer/assets/provider-icons/openrouter.svg'
import robotIcon from '@renderer/assets/provider-icons/robot-2-line.svg'
import siliconcloudIcon from '@renderer/assets/provider-icons/siliconcloud.svg'

/**
 * Provider icon mapping
 * Maps provider names (case-insensitive) to their corresponding icon
 */
export const PROVIDER_ICON_MAP: Record<string, string> = {
  openai: openaiIcon,
  anthropic: anthropicIcon,
  deepseek: deepseekIcon,
  moonshot: moonshotIcon,
  silliconflow: siliconcloudIcon, // Support legacy typo
  siliconflow: siliconcloudIcon,
  siliconcloud: siliconcloudIcon,
  openrouter: openrouterIcon,
  ollama: ollamaIcon,
  ollamma: ollamaIcon, // Support typo from original code
  groq: groqIcon,
}

/**
 * Get the icon source for a given provider name
 * @param provider - The provider name (case-insensitive)
 * @returns The icon source URL, or the default robot icon if not found
 */
export const getProviderIcon = (provider?: string): string => {
  if (!provider) {
    return robotIcon
  }
  return PROVIDER_ICON_MAP[provider.toLowerCase()] ?? robotIcon
}

/**
 * Default fallback icon for unknown providers
 */
export const DEFAULT_PROVIDER_ICON = robotIcon

/**
 * All available provider icons as a readonly array
 */
export const AVAILABLE_PROVIDERS = Object.keys(PROVIDER_ICON_MAP) as ReadonlyArray<string>
