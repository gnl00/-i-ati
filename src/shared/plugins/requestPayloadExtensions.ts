import type {
  RequestAdapterThinkingCapability,
  RequestPayloadExtensionPatches
} from './types'

export type RequestPayloadExtensionFeature = 'thinking'

export interface ProviderPayloadExtensions {
  thinking?: string
}

export interface RequestPayloadExtensionMatchHints {
  baseUrlKeywords?: string[]
  modelKeywords?: string[]
}

export interface RequestPayloadExtensionDefinition {
  id: string
  label: string
  description: string
  feature: RequestPayloadExtensionFeature
  thinking?: RequestAdapterThinkingCapability
  matchHints?: RequestPayloadExtensionMatchHints
  patches?: RequestPayloadExtensionPatches
}

export const DEEPSEEK_THINKING_PAYLOAD_EXTENSION_ID = 'deepseek-thinking'
export const XIAOMI_THINKING_PAYLOAD_EXTENSION_ID = 'xiaomi-thinking'
export const DOUBAO_THINKING_PAYLOAD_EXTENSION_ID = 'doubao-thinking'

const DEEPSEEK_REASONING_EFFORT_LEVELS: ThinkingLevel[] = ['low', 'medium', 'high', 'max', 'xhigh']

const THINKING_TYPE_PATCHES: RequestPayloadExtensionPatches = {
  thinking: {
    enabled: [
      { op: 'set', path: 'thinking.type', value: 'enabled' }
    ],
    disabled: [
      { op: 'set', path: 'thinking.type', value: 'disabled' }
    ]
  }
}

export const BUILT_IN_REQUEST_PAYLOAD_EXTENSIONS: RequestPayloadExtensionDefinition[] = [
  {
    id: DEEPSEEK_THINKING_PAYLOAD_EXTENSION_ID,
    label: 'DeepSeek Thinking',
    description: 'Adds DeepSeek OpenAI-compatible thinking.type and reasoning_effort fields.',
    feature: 'thinking',
    thinking: {
      levels: ['none', 'low', 'medium', 'high', 'max', 'xhigh'],
      defaultLevel: 'medium'
    },
    matchHints: {
      baseUrlKeywords: ['deepseek'],
      modelKeywords: ['deepseek']
    },
    patches: {
      thinking: {
        enabled: [
          { op: 'set', path: 'thinking.type', value: 'enabled' },
          {
            op: 'setFromThinkingEffort',
            path: 'reasoning_effort',
            allowedValues: DEEPSEEK_REASONING_EFFORT_LEVELS
          }
        ],
        disabled: [
          { op: 'set', path: 'thinking.type', value: 'disabled' },
          { op: 'unset', path: 'reasoning_effort' }
        ]
      }
    }
  },
  {
    id: XIAOMI_THINKING_PAYLOAD_EXTENSION_ID,
    label: 'Xiaomi Thinking',
    description: 'Adds Xiaomi thinking.type fields for MiMo reasoning models.',
    feature: 'thinking',
    thinking: {
      levels: ['none', 'enabled'],
      defaultLevel: 'enabled'
    },
    matchHints: {
      baseUrlKeywords: ['xiaomi', 'mimo'],
      modelKeywords: ['mimo']
    },
    patches: THINKING_TYPE_PATCHES
  },
  {
    id: DOUBAO_THINKING_PAYLOAD_EXTENSION_ID,
    label: 'Doubao Thinking',
    description: 'Adds Doubao thinking.type fields.',
    feature: 'thinking',
    thinking: {
      levels: ['none', 'enabled'],
      defaultLevel: 'enabled'
    },
    matchHints: {
      baseUrlKeywords: ['doubao', 'volces', 'volcengine'],
      modelKeywords: ['doubao']
    },
    patches: THINKING_TYPE_PATCHES
  }
]

export const getRequestPayloadExtensionById = (
  extensionId: string | undefined
): RequestPayloadExtensionDefinition | undefined => {
  if (!extensionId) {
    return undefined
  }
  return BUILT_IN_REQUEST_PAYLOAD_EXTENSIONS.find(extension => extension.id === extensionId)
}

export const listRequestPayloadExtensionsByFeature = (
  feature: RequestPayloadExtensionFeature
): RequestPayloadExtensionDefinition[] => {
  return BUILT_IN_REQUEST_PAYLOAD_EXTENSIONS.filter(extension => extension.feature === feature)
}
