import { describe, expect, it } from 'vitest';
import {
  buildChatTranscriptItems,
  getChatMessageScrollerId,
  getPendingAssistantScrollerId,
} from '../ChatTranscriptScroller';
import { MESSAGE_SOURCE } from '@shared/messages/messageSources';

const createMessage = (
  id: number | undefined,
  role: 'user' | 'assistant',
): MessageEntity => ({
  id,
  body: {
    role,
    content: role === 'user' ? 'question' : 'answer',
    segments: [],
  },
});

describe('ChatTranscriptScroller identity and anchors', () => {
  it('keeps the current assistant React key stable while its primitive id changes', () => {
    const user = createMessage(101, 'user');
    const pendingItems = buildChatTranscriptItems({
      chatUuid: 'chat-a',
      displayMessages: [user],
      latestUserIndex: 0,
      lastAssistantIndex: 1,
      hasCurrentTurnAssistant: false,
      shouldRenderPendingAssistant: true,
    });
    const committedItems = buildChatTranscriptItems({
      chatUuid: 'chat-a',
      displayMessages: [user, createMessage(202, 'assistant')],
      latestUserIndex: 0,
      lastAssistantIndex: 1,
      hasCurrentTurnAssistant: true,
      shouldRenderPendingAssistant: false,
    });

    expect(pendingItems.at(-1)?.key).toBe(committedItems.at(-1)?.key);
    expect(pendingItems.at(-1)?.messageId).toBe('pending-assistant:chat-a');
    expect(committedItems.at(-1)?.messageId).toBe('202');
  });

  it('uses chat-scoped fallback ids and marks user rows as anchors', () => {
    const pendingUser = createMessage(-1, 'user');
    const items = buildChatTranscriptItems({
      chatUuid: 'chat-b',
      displayMessages: [pendingUser, createMessage(7, 'assistant')],
      latestUserIndex: 0,
      lastAssistantIndex: 1,
      hasCurrentTurnAssistant: true,
      shouldRenderPendingAssistant: false,
    });

    expect(getChatMessageScrollerId(pendingUser, 0, 'chat-b')).toBe(
      'pending-user:chat-b:0',
    );
    expect(items[0]).toMatchObject({
      messageId: 'pending-user:chat-b:0',
      scrollAnchor: true,
      forceVisible: true,
    });
    expect(items[1]).toMatchObject({
      messageId: '7',
      scrollAnchor: false,
    });
    expect(getPendingAssistantScrollerId('chat-b')).toBe(
      'pending-assistant:chat-b',
    );
  });

  it('keeps schedule markers outside the user anchor flow', () => {
    const scheduleMarker = createMessage(8, 'user');
    scheduleMarker.body.source = MESSAGE_SOURCE.SCHEDULE;

    const items = buildChatTranscriptItems({
      chatUuid: 'chat-c',
      displayMessages: [scheduleMarker],
      latestUserIndex: 0,
      lastAssistantIndex: -1,
      hasCurrentTurnAssistant: false,
      shouldRenderPendingAssistant: false,
    });

    expect(items[0]).toMatchObject({
      messageId: '8',
      scrollAnchor: false,
    });
  });

  it('omits standalone tool records before creating scroller items', () => {
    const assistant = createMessage(7, 'assistant');
    const toolResult = createMessage(9, 'assistant');
    toolResult.body.role = 'tool';
    const scheduleMarker = createMessage(8, 'user');
    scheduleMarker.body.source = MESSAGE_SOURCE.SCHEDULE;

    const items = buildChatTranscriptItems({
      chatUuid: 'chat-d',
      displayMessages: [assistant, toolResult, scheduleMarker],
      latestUserIndex: 2,
      lastAssistantIndex: 0,
      hasCurrentTurnAssistant: false,
      shouldRenderPendingAssistant: false,
    });

    expect(items.map((item) => item.messageId)).toEqual(['7', '8']);
  });
});
