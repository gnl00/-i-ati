// Provider icons
import anthropicIcon from '@renderer/assets/provider-icons/anthropic.svg'
import deepseekIcon from '@renderer/assets/provider-icons/deepseek.svg'
import geminiColorIcon from '@renderer/assets/provider-icons/gemini-color.svg'
import githubCopilotIcon from '@renderer/assets/provider-icons/githubcopilot.svg'
import grokIcon from '@renderer/assets/provider-icons/grok.svg'
import groqIcon from '@renderer/assets/provider-icons/groq.svg'
import kimiColorIcon from '@renderer/assets/provider-icons/kimi-color.svg'
import minimaxColorIcon from '@renderer/assets/provider-icons/minimax-color.svg'
import moonshotIcon from '@renderer/assets/provider-icons/moonshot.svg'
import ollamaIcon from '@renderer/assets/provider-icons/ollama.svg'
import openaiTextIcon from '@renderer/assets/provider-icons/openai-text.svg'
import openaiIcon from '@renderer/assets/provider-icons/openai.svg'
import openrouterIcon from '@renderer/assets/provider-icons/openrouter.svg'
import robotIcon from '@renderer/assets/provider-icons/robot-2-line.svg'
import siliconcloudIcon from '@renderer/assets/provider-icons/siliconcloud.svg'
import zaiIcon from '@renderer/assets/provider-icons/zai.svg'
import zerooneIcon from '@renderer/assets/provider-icons/zeroone.svg'
import zhipuIcon from '@renderer/assets/provider-icons/zhipu.svg'

/**
 * Provider icon mapping
 * Maps provider names (case-insensitive) to their corresponding icon
 */
export const PROVIDER_ICON_MAP: Record<string, string> = {
  // OpenAI + variants
  openai: openaiIcon,
  'openai-text': openaiTextIcon,
  // Anthropic
  anthropic: anthropicIcon,
  // Google / Gemini
  google: geminiColorIcon,
  gemini: geminiColorIcon,
  // Grok / xAI
  grok: grokIcon,
  xai: grokIcon,
  // Groq
  deepseek: deepseekIcon,
  groq: groqIcon,
  // Moonshot / Kimi
  moonshot: moonshotIcon,
  kimi: kimiColorIcon,
  // Minimax
  minimax: minimaxColorIcon,
  // OpenRouter
  siliconflow: siliconcloudIcon,
  siliconcloud: siliconcloudIcon,
  silicon: siliconcloudIcon,
  openrouter: openrouterIcon,
  ollama: ollamaIcon,
  // Github Copilot
  githubcopilot: githubCopilotIcon,
  copilot: githubCopilotIcon,
  // Zhipu / Z.ai
  zhipu: zhipuIcon,
  zai: zaiIcon,
  'z.ai': zaiIcon,
  // 01.AI
  zeroone: zerooneIcon,
  '01ai': zerooneIcon,
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
