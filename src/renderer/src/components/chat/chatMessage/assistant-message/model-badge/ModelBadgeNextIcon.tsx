import React from 'react'
import { cn } from '@renderer/lib/utils'
import { getProviderIcon } from '@renderer/utils/providerIcons'

interface ModelBadgeNextIconProps {
  provider?: string
  model: string
  animate?: boolean
}

function inferProviderFromModel(model: string): string | undefined {
  const normalized = model.trim().toLowerCase()
  if (!normalized) return undefined

  if (normalized.includes('gpt') || normalized.includes('openai') || normalized.includes('o1') || normalized.includes('o3') || normalized.includes('o4')) {
    return 'openai'
  }
  if (normalized.includes('claude')) {
    return 'anthropic'
  }
  if (normalized.includes('gemini')) {
    return 'gemini'
  }
  if (normalized.includes('minimax') || normalized.includes('abab')) {
    return 'minimax'
  }
  if (normalized.includes('deepseek')) {
    return 'deepseek'
  }
  if (normalized.includes('grok')) {
    return 'grok'
  }
  if (normalized.includes('groq')) {
    return 'groq'
  }
  if (normalized.includes('kimi') || normalized.includes('moonshot')) {
    return 'moonshot'
  }
  if (normalized.includes('qwen') || normalized.includes('zai') || normalized.includes('glm') || normalized.includes('zhipu')) {
    return normalized.includes('zhipu') || normalized.includes('glm') ? 'zhipu' : 'zai'
  }
  if (normalized.includes('ollama')) {
    return 'ollama'
  }
  if (normalized.includes('openrouter')) {
    return 'openrouter'
  }

  return undefined
}

export const ModelBadgeNextIcon: React.FC<ModelBadgeNextIconProps> = ({
  provider,
  model,
  animate = false
}) => {
  const iconSrc = getProviderIcon(provider || inferProviderFromModel(model))

  return (
    <span
      className={cn(
        'inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center overflow-hidden rounded-[10px]',
        'bg-slate-100/92 dark:bg-white/4.5'
      )}
    >
      <img
        src={iconSrc}
        alt=""
        aria-hidden="true"
        className={cn(
          'h-3 w-3 object-contain',
          animate && 'animate-model-badge-dot'
        )}
      />
    </span>
  )
}
