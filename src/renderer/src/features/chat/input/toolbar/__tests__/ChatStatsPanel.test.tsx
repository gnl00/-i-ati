// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chatState = vi.hoisted(() => ({
  messages: [{
    id: 1,
    tokens: 699,
    body: {
      role: 'assistant',
      content: '',
      segments: []
    }
  }],
  currentChatId: 1,
  currentChatUuid: 'chat-1',
  selectedModelRef: {
    accountId: 'account-1',
    modelId: 'model-1'
  },
  postRunJobs: {
    compression: 'idle'
  },
  compressionSummaryRevisionByChatUuid: {
    'chat-1': 0
  }
}))

const configState = vi.hoisted(() => ({
  appConfig: {
    compression: {
      enabled: true,
      autoCompress: true,
      triggerTokenRatio: 0.7
    }
  },
  mainModel: undefined,
  providersRevision: 0,
  resolveModelRef: vi.fn(() => ({
    model: {
      id: 'model-1',
      contextWindowTokens: 1000
    }
  }))
}))

vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: (selector: (state: typeof chatState) => unknown): unknown => selector(chatState)
}))

vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: (selector: (state: typeof configState) => unknown): unknown => selector(configState)
}))

vi.mock('@renderer/features/assistants', () => ({
  useAssistantStore: (): { currentAssistant: null } => ({ currentAssistant: null })
}))

vi.mock('../useChatStatsData', () => ({
  useChatStatsData: (): {
    chatId: number
    activeSkills: string[]
    compressionCount: number
    activeCompressedMessageIds: Set<number>
    loading: boolean
    hasSnapshot: boolean
  } => ({
    chatId: 1,
    activeSkills: ['frontend-design'],
    compressionCount: 3,
    activeCompressedMessageIds: new Set<number>(),
    loading: false,
    hasSnapshot: true
  })
}))

import ChatStatsPanel from '../ChatStatsPanel'

describe('ChatStatsPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders a flat threshold instrument and full-width activity definitions', async () => {
    await act(async () => {
      root.render(<ChatStatsPanel variant="inline" />)
    })

    const progress = container.querySelector('[role="progressbar"]')
    expect(progress?.getAttribute('aria-valuenow')).toBe('99.9')
    expect(progress?.getAttribute('aria-label')).toBe('Progress to automatic compaction')
    expect(container.querySelector('[aria-label="99.9% to compact"]')).not.toBeNull()
    expect(container.textContent).toContain('699')
    expect(container.textContent).toContain('700 trigger')
    expect(container.textContent).toContain('Model window 1K')
    expect(container.textContent).toContain('Trigger at 70%')
    expect(container.textContent).not.toContain('3 compressions')
    expect(container.textContent).not.toContain('Context unavailable')

    const terms = Array.from(container.querySelectorAll('dt')).map(term => term.textContent)
    expect(terms).toEqual(['Tokens', 'Tools', 'Skills'])
    expect(container.querySelectorAll('section')).toHaveLength(2)
    expect(container.querySelector('article')).toBeNull()
  })
})
