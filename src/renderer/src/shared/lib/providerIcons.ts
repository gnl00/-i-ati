// Provider icons
import anthropicIcon from '@renderer/shared/assets/provider-icons/anthropic.svg'
import deepseekIcon from '@renderer/shared/assets/provider-icons/deepseek.svg'
import doubaoIcon from '@renderer/shared/assets/provider-icons/doubao.svg'
import geminiColorIcon from '@renderer/shared/assets/provider-icons/gemini-color.svg'
import githubCopilotIcon from '@renderer/shared/assets/provider-icons/githubcopilot.svg'
import grokIcon from '@renderer/shared/assets/provider-icons/grok.svg'
import groqIcon from '@renderer/shared/assets/provider-icons/groq.svg'
import kimiColorIcon from '@renderer/shared/assets/provider-icons/kimi-color.svg'
import minimaxColorIcon from '@renderer/shared/assets/provider-icons/minimax-color.svg'
import moonshotIcon from '@renderer/shared/assets/provider-icons/moonshot.svg'
import ollamaIcon from '@renderer/shared/assets/provider-icons/ollama.svg'
import openaiTextIcon from '@renderer/shared/assets/provider-icons/openai-text.svg'
import openaiIcon from '@renderer/shared/assets/provider-icons/openai.svg'
import openrouterIcon from '@renderer/shared/assets/provider-icons/openrouter.svg'
import qwenIcon from '@renderer/shared/assets/provider-icons/qwen.svg'
import robotIcon from '@renderer/shared/assets/provider-icons/robot-2-line.svg'
import siliconcloudIcon from '@renderer/shared/assets/provider-icons/siliconcloud.svg'
import xiaomiMiMoIcon from '@renderer/shared/assets/provider-icons/xiaomimimo.svg'
import zaiIcon from '@renderer/shared/assets/provider-icons/zai.svg'
import zerooneIcon from '@renderer/shared/assets/provider-icons/zeroone.svg'
import zhipuIcon from '@renderer/shared/assets/provider-icons/zhipu.svg'

export type ProviderIconAppearance = 'brand' | 'monochrome'

export interface ProviderIconDescriptor {
  src: string
  appearance: ProviderIconAppearance
}

const brandIcon = (src: string): ProviderIconDescriptor => ({ src, appearance: 'brand' })
const monochromeIcon = (src: string): ProviderIconDescriptor => ({
  src,
  appearance: 'monochrome'
})

const openaiDescriptor = monochromeIcon(openaiIcon)
const openaiTextDescriptor = monochromeIcon(openaiTextIcon)
const anthropicDescriptor = monochromeIcon(anthropicIcon)
const geminiDescriptor = brandIcon(geminiColorIcon)
const grokDescriptor = monochromeIcon(grokIcon)
const deepseekDescriptor = monochromeIcon(deepseekIcon)
const groqDescriptor = monochromeIcon(groqIcon)
const doubaoDescriptor = brandIcon(doubaoIcon)
const moonshotDescriptor = monochromeIcon(moonshotIcon)
const kimiDescriptor = brandIcon(kimiColorIcon)
const minimaxDescriptor = brandIcon(minimaxColorIcon)
const siliconcloudDescriptor = monochromeIcon(siliconcloudIcon)
const openrouterDescriptor = monochromeIcon(openrouterIcon)
const ollamaDescriptor = monochromeIcon(ollamaIcon)
const githubCopilotDescriptor = monochromeIcon(githubCopilotIcon)
const zhipuDescriptor = brandIcon(zhipuIcon)
const zaiDescriptor = monochromeIcon(zaiIcon)
const zerooneDescriptor = monochromeIcon(zerooneIcon)
const xiaomiMiMoDescriptor = monochromeIcon(xiaomiMiMoIcon)
const qwenDescriptor = brandIcon(qwenIcon)

/**
 * Provider icon metadata mapping.
 * Aliases share descriptor objects so each asset has one appearance classification.
 */
export const PROVIDER_ICON_DESCRIPTOR_MAP: Record<string, ProviderIconDescriptor> = {
  // OpenAI + variants
  openai: openaiDescriptor,
  'openai-text': openaiTextDescriptor,
  // Anthropic
  anthropic: anthropicDescriptor,
  // Google / Gemini
  google: geminiDescriptor,
  gemini: geminiDescriptor,
  // Grok / xAI
  grok: grokDescriptor,
  xai: grokDescriptor,
  // Groq
  deepseek: deepseekDescriptor,
  groq: groqDescriptor,
  // Doubao / Volcengine
  doubao: doubaoDescriptor,
  volcengine: doubaoDescriptor,
  volces: doubaoDescriptor,
  // Moonshot / Kimi
  moonshot: moonshotDescriptor,
  kimi: kimiDescriptor,
  // Minimax
  minimax: minimaxDescriptor,
  // SiliconCloud / OpenRouter / Ollama
  siliconflow: siliconcloudDescriptor,
  siliconcloud: siliconcloudDescriptor,
  silicon: siliconcloudDescriptor,
  openrouter: openrouterDescriptor,
  ollama: ollamaDescriptor,
  // Github Copilot
  githubcopilot: githubCopilotDescriptor,
  copilot: githubCopilotDescriptor,
  // Zhipu / Z.ai
  zhipu: zhipuDescriptor,
  zai: zaiDescriptor,
  'z.ai': zaiDescriptor,
  // 01.AI
  zeroone: zerooneDescriptor,
  '01ai': zerooneDescriptor,
  // Xiaomi MiMo
  xiaomi: xiaomiMiMoDescriptor,
  xiaomimimo: xiaomiMiMoDescriptor,
  mimo: xiaomiMiMoDescriptor,
  // Qwen / Tongyi
  qwen: qwenDescriptor,
  tongyi: qwenDescriptor,
}

/**
 * Default fallback icon metadata for unknown providers.
 */
export const DEFAULT_PROVIDER_ICON_DESCRIPTOR = monochromeIcon(robotIcon)

/**
 * Get icon metadata for a given provider name.
 */
export const getProviderIconDescriptor = (provider?: string): ProviderIconDescriptor => {
  if (!provider) {
    return DEFAULT_PROVIDER_ICON_DESCRIPTOR
  }
  return PROVIDER_ICON_DESCRIPTOR_MAP[provider.toLowerCase()] ?? DEFAULT_PROVIDER_ICON_DESCRIPTOR
}

/**
 * Backward-compatible source URL mapping for non-visual consumers.
 */
export const PROVIDER_ICON_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_ICON_DESCRIPTOR_MAP).map(([provider, descriptor]) => [
    provider,
    descriptor.src
  ])
)

/**
 * Get the icon source for a given provider name
 * @param provider - The provider name (case-insensitive)
 * @returns The icon source URL, or the default robot icon if not found
 */
export const getProviderIcon = (provider?: string): string => {
  return getProviderIconDescriptor(provider).src
}

/**
 * Default fallback icon for unknown providers
 */
export const DEFAULT_PROVIDER_ICON = robotIcon

/**
 * All available provider icons as a readonly array
 */
export const AVAILABLE_PROVIDERS = Object.keys(PROVIDER_ICON_MAP) as ReadonlyArray<string>
