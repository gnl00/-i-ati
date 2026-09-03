/* eslint-disable react/display-name, react/prop-types */
import React, {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from '@renderer/shared/components/ui/message-scroller';
import ChatMessageComponent from '@renderer/features/chat/message/ChatMessageComponent';
import { useChatStore } from '@renderer/features/chat/state/chatStore';
import {
  HIDDEN_MESSAGE_SOURCES,
  MESSAGE_SOURCE,
} from '@shared/messages/messageSources';
import type { ChatRunScrollHint } from '@renderer/features/chat/state/chatRunUiStore';
import { cn } from '@renderer/shared/lib/utils';

const CHAT_SCROLL_EDGE_THRESHOLD_PX = 80;
const CHAT_SCROLL_PREVIOUS_ITEM_PEEK_PX = 24;
const PENDING_USER_MESSAGE_ID = -1;
const UNMOUNTED_MESSAGE_BODY_HEIGHT = '10rem';
const TRANSCRIPT_COLUMN_CLASS = 'mx-auto w-full max-w-4xl';

export type PendingAssistantModel = {
  model?: string;
  modelRef?: ModelRef;
};

export type ChatTranscriptItem =
  | {
      type: 'message';
      key: string;
      messageId: string;
      message: MessageEntity;
      messageIndex: number;
      scrollAnchor: boolean;
      forceVisible: boolean;
    }
  | {
      type: 'pending-assistant';
      key: string;
      messageId: string;
      messageIndex: number;
      scrollAnchor: false;
      forceVisible: true;
    };

export function getChatMessageScrollerId(
  message: MessageEntity,
  index: number,
  chatUuid?: string,
): string {
  if (
    message.id !== undefined &&
    message.id !== null &&
    message.id !== PENDING_USER_MESSAGE_ID
  ) {
    return String(message.id);
  }

  return `pending-user:${chatUuid ?? 'empty'}:${index}`;
}

export function getPendingAssistantScrollerId(chatUuid?: string): string {
  return `pending-assistant:${chatUuid ?? 'empty'}`;
}

function getAssistantTurnKey(
  chatUuid: string | undefined,
  latestUserMessage: MessageEntity | undefined,
  latestUserIndex: number,
): string {
  const userIdentity = latestUserMessage?.id ?? latestUserIndex;
  return `assistant-turn:${chatUuid ?? 'empty'}:${userIdentity}`;
}

export function buildChatTranscriptItems({
  chatUuid,
  displayMessages,
  latestUserIndex,
  lastAssistantIndex,
  hasCurrentTurnAssistant,
  shouldRenderPendingAssistant,
}: {
  chatUuid?: string;
  displayMessages: MessageEntity[];
  latestUserIndex: number;
  lastAssistantIndex: number;
  hasCurrentTurnAssistant: boolean;
  shouldRenderPendingAssistant: boolean;
}): ChatTranscriptItem[] {
  const latestUserMessage =
    latestUserIndex >= 0 ? displayMessages[latestUserIndex] : undefined;
  const assistantTurnKey = getAssistantTurnKey(
    chatUuid,
    latestUserMessage,
    latestUserIndex,
  );

  const visibleMessages = displayMessages
    .map((message, messageIndex) => ({ message, messageIndex }))
    .filter(
      ({ message }) =>
        (message.body.role === 'user' || message.body.role === 'assistant') &&
        (!message.body.source ||
          !HIDDEN_MESSAGE_SOURCES.has(message.body.source)),
    );
  const items: ChatTranscriptItem[] = visibleMessages.map(
    ({ message, messageIndex }) => {
      const messageId = getChatMessageScrollerId(
        message,
        messageIndex,
        chatUuid,
      );
      const isCurrentAssistant =
        message.body.role === 'assistant' &&
        hasCurrentTurnAssistant &&
        messageIndex === lastAssistantIndex;

      const isUserAnchor =
        message.body.role === 'user' &&
        message.body.source !== MESSAGE_SOURCE.SCHEDULE;

      return {
        type: 'message',
        key: isCurrentAssistant
          ? assistantTurnKey
          : message.id !== undefined && message.id !== null
            ? `message:${message.id}`
            : messageId,
        messageId,
        message,
        messageIndex,
        scrollAnchor: isUserAnchor,
        forceVisible:
          messageIndex === latestUserIndex ||
          messageIndex === lastAssistantIndex ||
          (message.body.role === 'user' &&
            message.id === PENDING_USER_MESSAGE_ID) ||
          isCurrentAssistant,
      };
    },
  );

  if (shouldRenderPendingAssistant) {
    items.push({
      type: 'pending-assistant',
      key: assistantTurnKey,
      messageId: getPendingAssistantScrollerId(chatUuid),
      messageIndex: displayMessages.length,
      scrollAnchor: false,
      forceVisible: true,
    });
  }

  return items;
}

function getHintKey(hint: ChatRunScrollHint): string {
  switch (hint.type) {
    case 'conversation-switch':
      return `${hint.type}:${hint.chatUuid ?? 'empty'}:${hint.index}:${hint.align}`;
    case 'user-sent':
      return `${hint.type}:${hint.chatUuid ?? 'empty'}:${hint.messageId ?? 'latest'}`;
    case 'search-result':
      return `${hint.type}:${hint.chatUuid ?? 'empty'}:${hint.messageId}`;
    default:
      return 'none';
  }
}

function findMessageItem(
  items: readonly ChatTranscriptItem[],
  messageId: number | undefined,
): ChatTranscriptItem | undefined {
  if (messageId === undefined) {
    return undefined;
  }

  const targetId = String(messageId);
  return items.find(
    (item) => item.type === 'message' && item.messageId === targetId,
  );
}

function findElementByMessageId(
  root: HTMLElement | null,
  messageId: string,
): HTMLElement | null {
  if (!root) return null;

  for (const element of root.querySelectorAll<HTMLElement>(
    '[data-message-id]',
  )) {
    if (element.dataset.messageId === messageId) {
      return element;
    }
  }

  return null;
}

function getInitiallyMountedBodyIds(
  items: readonly ChatTranscriptItem[],
): Set<string> {
  const finalItemsStart = Math.max(0, items.length - 2);
  return new Set(
    items
      .filter(
        (item, index) => item.forceVisible || index >= finalItemsStart,
      )
      .map((item) => item.messageId),
  );
}

const ChatMessageBodyPlaceholder: React.FC = memo(() => (
  <div
    role="status"
    aria-label="Message content loading"
    data-testid="message-body-placeholder"
    className="min-h-40"
    style={{ minHeight: UNMOUNTED_MESSAGE_BODY_HEIGHT }}
  />
));

const ChatMessageRow: React.FC<{
  messageIndex: number;
  message: MessageEntity;
  previewMessage?: ChatMessage;
  lastAssistantIndex: number;
  lastMessageIndex: number;
  isPending?: boolean;
}> = memo(
  ({
    messageIndex,
    message,
    previewMessage,
    lastAssistantIndex,
    lastMessageIndex,
    isPending = false,
  }) => {
    const isLatest =
      message.body.role === 'assistant'
        ? messageIndex === lastAssistantIndex
        : messageIndex === lastMessageIndex;

    return (
      <ChatMessageComponent
        messageId={message.id}
        message={message.body}
        tokenUsage={message.tokenUsage}
        previewMessage={previewMessage}
        index={messageIndex}
        isLatest={isLatest}
        isPending={isPending}
      />
    );
  },
);

const ChatPendingAssistantRow: React.FC<{
  messageIndex: number;
  pendingAssistantModel: PendingAssistantModel;
  previewMessage?: ChatMessage;
}> = memo(({ messageIndex, pendingAssistantModel, previewMessage }) => (
  <ChatMessageComponent
    index={messageIndex}
    pendingAssistantModel={pendingAssistantModel}
    previewMessage={previewMessage}
    isLatest
  />
));

export interface ChatTranscriptScrollerProps {
  chatUuid?: string;
  displayMessages: MessageEntity[];
  previewMessage?: MessageEntity;
  previewRenderIndex: number;
  lastAssistantIndex: number;
  lastMessageIndex: number;
  latestUserIndex: number;
  hasCurrentTurnAssistant: boolean;
  shouldRenderPendingAssistant: boolean;
  pendingAssistantModel: PendingAssistantModel;
  topOcclusionPx: number;
  isRunStreaming: boolean;
}

const ChatTranscriptScrollerBody: React.FC<ChatTranscriptScrollerProps> = ({
  chatUuid,
  displayMessages,
  previewMessage,
  previewRenderIndex,
  lastAssistantIndex,
  lastMessageIndex,
  latestUserIndex,
  hasCurrentTurnAssistant,
  shouldRenderPendingAssistant,
  pendingAssistantModel,
  topOcclusionPx,
  isRunStreaming,
}) => {
  const scrollHint = useChatStore((state) => state.scrollHint);
  const clearScrollHint = useChatStore((state) => state.clearScrollHint);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const consumedHintRef = useRef<string | null>(null);
  // Visited bodies stay mounted for local disclosure state; full recycling is a separate feature.
  const retainedBodyIdsRef = useRef<Set<string>>(new Set());
  const { scrollToMessage } = useMessageScroller();
  const { visibleMessageIds } = useMessageScrollerVisibility();

  const items = useMemo(
    () =>
      buildChatTranscriptItems({
        chatUuid,
        displayMessages,
        latestUserIndex,
        lastAssistantIndex,
        hasCurrentTurnAssistant,
        shouldRenderPendingAssistant,
      }),
    [
      chatUuid,
      displayMessages,
      hasCurrentTurnAssistant,
      lastAssistantIndex,
      latestUserIndex,
      shouldRenderPendingAssistant,
    ],
  );

  const searchTargetId =
    scrollHint.type === 'search-result' &&
    scrollHint.chatUuid === (chatUuid ?? null)
      ? String(scrollHint.messageId)
      : null;

  const itemsWithSearchTarget = useMemo(() => {
    if (!searchTargetId) return items;
    return items.map((item) =>
      item.type === 'message' && item.messageId === searchTargetId
        ? { ...item, forceVisible: true }
        : item,
    );
  }, [items, searchTargetId]);

  const initiallyMountedBodyIds = useMemo(
    () => getInitiallyMountedBodyIds(itemsWithSearchTarget),
    [itemsWithSearchTarget],
  );
  const activeMessageIds = useMemo(
    () => new Set(itemsWithSearchTarget.map((item) => item.messageId)),
    [itemsWithSearchTarget],
  );
  const mountedBodyIds = useMemo(() => {
    const nextMountedBodyIds = new Set<string>(initiallyMountedBodyIds);
    for (const messageId of visibleMessageIds) {
      if (activeMessageIds.has(messageId)) {
        nextMountedBodyIds.add(messageId);
      }
    }
    for (const messageId of retainedBodyIdsRef.current) {
      if (activeMessageIds.has(messageId)) {
        nextMountedBodyIds.add(messageId);
      }
    }
    return nextMountedBodyIds;
  }, [activeMessageIds, initiallyMountedBodyIds, visibleMessageIds]);

  useLayoutEffect(() => {
    const retainedBodyIds = retainedBodyIdsRef.current;
    for (const messageId of retainedBodyIds) {
      if (!activeMessageIds.has(messageId)) {
        retainedBodyIds.delete(messageId);
      }
    }
    for (const messageId of mountedBodyIds) {
      retainedBodyIds.add(messageId);
    }
  }, [activeMessageIds, mountedBodyIds]);

  const findHintTarget = useCallback(
    (hint: ChatRunScrollHint): ChatTranscriptItem | undefined => {
      if (hint.type === 'conversation-switch') {
        const indexedMessage = displayMessages[hint.index];
        if (!indexedMessage) return undefined;
        return items.find(
          (item) => item.type === 'message' && item.message === indexedMessage,
        );
      }

      if (hint.type === 'user-sent') {
        return (
          findMessageItem(items, hint.messageId) ??
          items
            .slice()
            .reverse()
            .find(
              (item) =>
                item.type === 'message' && item.message.body.role === 'user',
            )
        );
      }

      if (hint.type === 'search-result') {
        return findMessageItem(items, hint.messageId);
      }

      return undefined;
    },
    [displayMessages, items],
  );

  useLayoutEffect(() => {
    if (scrollHint.type === 'none') {
      consumedHintRef.current = null;
      return;
    }
    if (scrollHint.chatUuid !== (chatUuid ?? null)) return;

    const hintKey = getHintKey(scrollHint);
    if (consumedHintRef.current === hintKey) return;

    const target = findHintTarget(scrollHint);
    if (!target) return;

    consumedHintRef.current = hintKey;

    if (scrollHint.type === 'user-sent') {
      clearScrollHint();
      return;
    }

    const didRequestScroll = scrollToMessage(target.messageId, {
      align:
        scrollHint.type === 'conversation-switch' ? scrollHint.align : 'start',
      behavior: 'auto',
      scrollMargin: topOcclusionPx,
    });

    if (scrollHint.type === 'search-result' && didRequestScroll) {
      window.requestAnimationFrame(() => {
        const targetElement = findElementByMessageId(
          viewportRef.current,
          target.messageId,
        );
        if (!targetElement) return;
        targetElement.style.scrollMarginBlockStart = `${topOcclusionPx}px`;
        targetElement.scrollIntoView?.({ block: 'start', behavior: 'auto' });
      });
    }

    clearScrollHint();
  }, [
    chatUuid,
    clearScrollHint,
    findHintTarget,
    scrollHint,
    scrollToMessage,
    topOcclusionPx,
  ]);

  const renderedLatestAssistant = useMemo(() => {
    if (shouldRenderPendingAssistant) {
      return previewMessage;
    }
    if (
      lastAssistantIndex < 0 ||
      lastAssistantIndex >= displayMessages.length
    ) {
      return undefined;
    }
    if (previewMessage && previewRenderIndex === lastAssistantIndex) {
      return previewMessage;
    }
    return displayMessages[lastAssistantIndex];
  }, [
    displayMessages,
    lastAssistantIndex,
    previewMessage,
    previewRenderIndex,
    shouldRenderPendingAssistant,
  ]);

  const handleJumpToLatestClick = useCallback(() => {
    const lastAssistantMessage = renderedLatestAssistant;
    const typewriterCompleted = Boolean(
      lastAssistantMessage?.body?.typewriterCompleted,
    );
    const segments = lastAssistantMessage?.body?.segments ?? [];
    const hasSegments = Array.isArray(segments) && segments.length > 0;
    const shouldSkipTypewriter =
      !lastAssistantMessage || typewriterCompleted || !hasSegments;

    if (!isRunStreaming && lastAssistantMessage && !shouldSkipTypewriter) {
      const updatedMessage: MessageEntity = {
        ...lastAssistantMessage,
        body: {
          ...lastAssistantMessage.body,
          typewriterCompleted: true,
        },
      };
      useChatStore.getState().upsertMessage(updatedMessage);
      if (updatedMessage.id) {
        void useChatStore.getState().patchMessageUiState(updatedMessage.id, {
          typewriterCompleted: true,
        });
      }
    }
  }, [
    displayMessages.length,
    isRunStreaming,
    lastMessageIndex,
    renderedLatestAssistant,
  ]);

  return (
    <MessageScroller className="h-full">
      <MessageScrollerViewport
        ref={viewportRef}
        data-testid="message-scroller-viewport"
        aria-label="Chat messages"
      >
        <MessageScrollerContent
          className={cn(TRANSCRIPT_COLUMN_CLASS, 'gap-6')}
          style={{ paddingBlockStart: topOcclusionPx }}
        >
          {itemsWithSearchTarget.map((item) => (
            <MessageScrollerItem
              key={item.key}
              messageId={item.messageId}
              scrollAnchor={item.scrollAnchor}
              data-testid="message-scroller-item"
              data-message-role={
                item.type === 'message' ? item.message.body.role : 'assistant'
              }
              style={{
                contentVisibility: item.forceVisible ? 'visible' : undefined,
                scrollMarginBlockStart: `${topOcclusionPx}px`,
              }}
            >
              {mountedBodyIds.has(item.messageId) && item.type === 'message' ? (
                <ChatMessageRow
                  messageIndex={item.messageIndex}
                  message={item.message}
                  previewMessage={
                    previewMessage && previewRenderIndex === item.messageIndex
                      ? previewMessage.body
                      : undefined
                  }
                  lastAssistantIndex={lastAssistantIndex}
                  lastMessageIndex={lastMessageIndex}
                  isPending={item.message.id === PENDING_USER_MESSAGE_ID}
                />
              ) : mountedBodyIds.has(item.messageId) ? (
                <ChatPendingAssistantRow
                  messageIndex={item.messageIndex}
                  pendingAssistantModel={pendingAssistantModel}
                  previewMessage={
                    !hasCurrentTurnAssistant ? previewMessage?.body : undefined
                  }
                />
              ) : (
                <ChatMessageBodyPlaceholder />
              )}
            </MessageScrollerItem>
          ))}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton onClick={handleJumpToLatestClick} />
    </MessageScroller>
  );
};

const ChatTranscriptScroller: React.FC<ChatTranscriptScrollerProps> = (
  props,
) => (
  <MessageScrollerProvider
    key={props.chatUuid ?? 'empty-chat'}
    autoScroll
    defaultScrollPosition="end"
    scrollEdgeThreshold={CHAT_SCROLL_EDGE_THRESHOLD_PX}
    scrollPreviousItemPeek={CHAT_SCROLL_PREVIOUS_ITEM_PEEK_PX}
    scrollMargin={props.topOcclusionPx}
  >
    <ChatTranscriptScrollerBody {...props} />
  </MessageScrollerProvider>
);

export default ChatTranscriptScroller;
