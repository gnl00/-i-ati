import { describe, expect, it } from 'vitest'
import {
  calculateAnchorLockBottomSpacer,
  CHAT_BASE_PADDING_END_PX,
  consumeAnchorLockCorrection,
  resolveVirtualizerAnchorTo,
  resolveScrollModeForRender,
  shouldKeepTailFollowOnUserIntent,
  resolveUserSentAnchorIndex
} from '../scroll-anchor'

const message = (id: number, role: 'user' | 'assistant') => ({
  type: 'message' as const,
  message: {
    id,
    body: { role }
  }
})

describe('chatScrollPolicy', () => {
  it('derives the first-render mode from the current scroll hint', () => {
    const base = {
      mode: 'tail-follow' as const,
      modeChatUuid: 'chat-1',
      currentChatUuid: 'chat-1'
    }

    expect(resolveScrollModeForRender({
      ...base,
      scrollHint: { type: 'user-sent', chatUuid: 'chat-1' }
    })).toBe('anchor-lock')
    expect(resolveScrollModeForRender({
      ...base,
      scrollHint: { type: 'search-result', chatUuid: 'chat-1' }
    })).toBe('manual')
    expect(resolveScrollModeForRender({
      ...base,
      mode: 'manual',
      scrollHint: { type: 'conversation-switch', chatUuid: 'chat-1' }
    })).toBe('tail-follow')
  })

  it('uses tail-follow for a new chat before its layout effects run', () => {
    expect(resolveScrollModeForRender({
      mode: 'manual',
      modeChatUuid: 'chat-1',
      currentChatUuid: 'chat-2',
      scrollHint: { type: 'none' }
    })).toBe('tail-follow')
  })

  it('keeps tail-follow for generic user intent while already at the end', () => {
    expect(shouldKeepTailFollowOnUserIntent('tail-follow', true)).toBe(true)
    expect(shouldKeepTailFollowOnUserIntent('tail-follow', false)).toBe(false)
    expect(shouldKeepTailFollowOnUserIntent('anchor-lock', true)).toBe(false)
    expect(shouldKeepTailFollowOnUserIntent('manual', true)).toBe(false)
  })

  it('uses end anchoring only while following the tail', () => {
    expect(resolveVirtualizerAnchorTo('tail-follow')).toBe('end')
    expect(resolveVirtualizerAnchorTo('anchor-lock')).toBe('start')
    expect(resolveVirtualizerAnchorTo('manual')).toBe('start')
  })

  it('applies anchor correction once measurements and spacer have settled', () => {
    const gate = { current: false }
    expect(consumeAnchorLockCorrection(gate, {
      spacerChanged: false,
      offset: 12
    })).toBe(false)

    gate.current = true
    expect(consumeAnchorLockCorrection(gate, {
      spacerChanged: true,
      offset: 12
    })).toBe(false)
    expect(gate.current).toBe(true)

    expect(consumeAnchorLockCorrection(gate, {
      spacerChanged: false,
      offset: 12
    })).toBe(true)
    expect(gate.current).toBe(false)
    expect(consumeAnchorLockCorrection(gate, {
      spacerChanged: false,
      offset: 12
    })).toBe(false)

    gate.current = true
    expect(consumeAnchorLockCorrection(gate, {
      spacerChanged: false,
      offset: 1
    })).toBe(false)
    expect(gate.current).toBe(false)
  })

  it('resolves the requested user message before pending assistant content', () => {
    const items = [
      message(1, 'user'),
      message(2, 'assistant'),
      message(3, 'user'),
      { type: 'pending-assistant' as const }
    ]

    expect(resolveUserSentAnchorIndex(items, 3)).toBe(2)
  })

  it('falls back to the latest visible user message when the hint has no id', () => {
    const items = [
      message(1, 'user'),
      message(2, 'assistant'),
      message(3, 'user'),
      { type: 'pending-assistant' as const }
    ]

    expect(resolveUserSentAnchorIndex(items)).toBe(2)
    expect(resolveUserSentAnchorIndex(items, 99)).toBe(-1)
  })

  it('shrinks the spacer as the assistant tail grows', () => {
    const initial = calculateAnchorLockBottomSpacer({
      anchorStart: 100,
      latestEnd: 300,
      viewportHeight: 800,
      topOcclusionPx: 48
    })
    const grown = calculateAnchorLockBottomSpacer({
      anchorStart: 100,
      latestEnd: 600,
      viewportHeight: 800,
      topOcclusionPx: 48
    })
    const filled = calculateAnchorLockBottomSpacer({
      anchorStart: 100,
      latestEnd: 1000,
      viewportHeight: 800,
      topOcclusionPx: 48
    })

    expect(initial).toBe(552)
    expect(grown).toBe(252)
    expect(grown).toBeLessThan(initial)
    expect(filled).toBe(CHAT_BASE_PADDING_END_PX)
  })

  it('accounts for viewport and top overlay changes', () => {
    const compactViewport = calculateAnchorLockBottomSpacer({
      anchorStart: 100,
      latestEnd: 400,
      viewportHeight: 600,
      topOcclusionPx: 48
    })
    const expandedViewport = calculateAnchorLockBottomSpacer({
      anchorStart: 100,
      latestEnd: 400,
      viewportHeight: 900,
      topOcclusionPx: 48
    })
    const expandedOverlay = calculateAnchorLockBottomSpacer({
      anchorStart: 100,
      latestEnd: 400,
      viewportHeight: 900,
      topOcclusionPx: 148
    })

    expect(expandedViewport).toBeGreaterThan(compactViewport)
    expect(expandedOverlay).toBeLessThan(expandedViewport)
  })
})
