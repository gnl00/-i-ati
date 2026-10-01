// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ messages: [] as MessageEntity[] }))
vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: (select: (value: typeof state) => unknown): unknown =>
    select(state),
}))
import { ImageShowResult } from '../ImageShowResult'

const payload = {
  kind: 'image_show',
  success: true,
  image: {
    assetId: `${'a'.repeat(64)}.png`,
    url: `image-asset://snapshot/${'a'.repeat(64)}.png`,
    mimeType: 'image/png',
    size: 100,
    width: 400,
    height: 300,
  },
  caption: 'Preview',
}
const toolCall: ToolCallSegment = {
  type: 'toolCall',
  segmentId: 'call-segment',
  name: 'image_show',
  toolCallId: 'call',
  toolCallIndex: 0,
  timestamp: 1,
  isError: false,
  content: { result: payload, status: 'completed' },
}

describe('inline image results', () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    state.messages = []
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  const render = async (): Promise<void> => {
    await act(async () => root.render(<ImageShowResult toolCall={toolCall} />))
  }
  it('shows the thumbnail and opens the existing viewer with keyboard focus restoration', async () => {
    await render()
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      payload.image.url,
    )
    expect(container.textContent).toContain('Preview')
    const button = container.querySelector('button')!
    button.focus()
    await act(async () =>
      button.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 0 }),
      ),
    )
    expect(
      document.querySelector('[data-testid="image-preview-overlay"]'),
    ).not.toBeNull()
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    expect(
      document.querySelector('[data-testid="image-preview-overlay"]'),
    ).toBeNull()
    await vi.waitFor(() => expect(document.activeElement).toBe(button))
  })
  it.each(['sent', 'failed', 'unknown', 'sending'])(
    'restores the persisted %s receipt instead of stale segment data',
    async (deliveryState) => {
      state.messages = [
        {
          id: 2,
          revision: 3,
          chatUuid: 'chat',
          body: {
            role: 'tool',
            name: 'image_show',
            toolCallId: 'call',
            content: JSON.stringify({
              ...payload,
              telegram: { state: deliveryState, chatId: '123' },
            }),
            segments: [],
          },
        },
      ]
      await render()
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        'Telegram',
      )
    },
  )
  it('shows a stable failure placeholder', async () => {
    await render()
    await act(async () =>
      container.querySelector('img')!.dispatchEvent(new Event('error')),
    )
    expect(container.textContent).toContain('Image unavailable')
    expect(container.querySelector('button')?.className).toContain('h-48')
  })
})
