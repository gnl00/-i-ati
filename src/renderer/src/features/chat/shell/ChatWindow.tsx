import { ArtifactsPanel } from '@renderer/features/artifacts';
import ChatHeader from '@renderer/features/chat/shell/ChatHeader';
import ChatInputArea, {
  type ChatInputAreaHandle,
} from '@renderer/features/chat/input/ChatInputArea';
import { ChatInputToolConfirmation } from '@renderer/features/chat/input/ChatInputToolConfirmation';
import { ChatInputUserQuestion } from '@renderer/features/chat/input/ChatInputUserQuestion';
import ChatSidePanelLayout from '@renderer/features/chat/shell/ChatSidePanelLayout';
import ChatTranscriptScroller from '@renderer/features/chat/shell/ChatTranscriptScroller';
import WelcomeMessage from '@renderer/features/chat/welcome/SmartWelcomeEntrance';
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig';
import { useChatStore } from '@renderer/features/chat/state/chatStore';
import { cn } from '@renderer/shared/lib/utils';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@renderer/shared/components/ui/resizable';
import { AnimatePresence, motion } from 'framer-motion';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TaskPlanBar } from '../task/TaskPlanBar';
import { useTaskPlan } from '@renderer/features/task-planner';
import { useSubagentRuntime } from '@renderer/features/subagents';
import { useToolConfirmations } from '@renderer/features/chat/toolConfirmation/useToolConfirmations';
import { useToolUserQuestions } from '@renderer/features/chat/toolUserQuestion/useToolUserQuestions';
import { useScheduleNotifications } from '@renderer/features/chat/schedule/useScheduleNotifications';

const CHAT_HEADER_OCCLUSION_PX = 48;
const CHAT_HEADER_OCCLUSION_PADDING_STYLE: React.CSSProperties = {
  paddingTop: CHAT_HEADER_OCCLUSION_PX,
};
const PENDING_USER_MESSAGE_ID = -1;
const ARTIFACTS_SIDE_PANEL_PREFERENCE_KEY = 'chat-artifacts';
const TRANSCRIPT_COLUMN_CLASS = 'mx-auto w-full max-w-4xl';

const ChatWindow: React.FC = () => {
  const messages = useChatStore((state) => state.messages);
  const previewMessage = useChatStore((state) => state.preview.message);
  const pendingUserMessage = useChatStore((state) => state.pendingUserMessage);
  const artifactsPanelOpen = useChatStore((state) => state.artifactsPanelOpen);
  const setArtifactsPanel = useChatStore((state) => state.setArtifactsPanel);
  const chatUuid = useChatStore((state) => state.currentChatUuid ?? undefined);
  const runPhase = useChatStore((state) => state.runPhase);
  const selectedModelRef = useChatStore((state) => state.selectedModelRef);
  const resolveModelRef = useAppConfigStore((state) => state.resolveModelRef);
  const providersRevision = useAppConfigStore(
    (state) => state.providersRevision,
  );
  const closeArtifactsPanel = useCallback(
    () => setArtifactsPanel(false),
    [setArtifactsPanel],
  );
  const selectedModel = useMemo(
    () => resolveModelRef(selectedModelRef),
    [providersRevision, resolveModelRef, selectedModelRef],
  );
  const committedLastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].body.role === 'assistant') {
        return i;
      }
    }
    return -1;
  }, [messages]);
  const latestUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].body.role === 'user') {
        return i;
      }
    }
    return -1;
  }, [messages]);
  const hasCurrentTurnAssistant =
    latestUserIndex >= 0
      ? committedLastAssistantIndex > latestUserIndex
      : committedLastAssistantIndex >= 0;
  const isAssistantResponseActive =
    runPhase === 'submitting' || runPhase === 'streaming';
  const shouldRenderPendingAssistant =
    latestUserIndex >= 0 &&
    !hasCurrentTurnAssistant &&
    (isAssistantResponseActive || Boolean(previewMessage));
  const pendingAssistantModel = useMemo(
    () => ({
      model: selectedModel?.model.label ?? selectedModelRef?.modelId,
      modelRef: selectedModelRef
        ? {
            accountId: selectedModelRef.accountId,
            modelId: selectedModelRef.modelId,
          }
        : undefined,
    }),
    [selectedModel?.model.label, selectedModelRef],
  );
  const previewRenderIndex = previewMessage
    ? hasCurrentTurnAssistant
      ? committedLastAssistantIndex
      : -1
    : -1;
  const pendingUserMessageEntity = useMemo<MessageEntity | null>(() => {
    if (!pendingUserMessage) return null;
    if (messages.length > 0) return null;
    if (pendingUserMessage.chatUuid !== (chatUuid ?? null)) return null;

    const mediaUrls: string[] = [];
    for (const item of pendingUserMessage.mediaCtx) {
      if (typeof item === 'string' && item.length > 0) {
        mediaUrls.push(item);
      }
    }

    const mediaContent = mediaUrls.map((url): VLMContent => ({
      type: 'image_url',
      image_url: {
        url,
        detail: 'auto',
      },
    }));

    const content: ChatMessage['content'] =
      mediaContent.length > 0
        ? [
            {
              type: 'text',
              text: pendingUserMessage.text,
            },
            ...mediaContent,
          ]
        : pendingUserMessage.text;

    return {
      id: PENDING_USER_MESSAGE_ID,
      chatId: undefined,
      chatUuid,
      body: {
        role: 'user',
        content,
        segments: [],
        createdAt: pendingUserMessage.createdAt,
      },
    };
  }, [chatUuid, messages.length, pendingUserMessage]);
  const displayMessages = useMemo(
    () => (pendingUserMessageEntity ? [pendingUserMessageEntity] : messages),
    [messages, pendingUserMessageEntity],
  );
  const lastAssistantIndex = shouldRenderPendingAssistant
    ? displayMessages.length
    : previewRenderIndex >= 0
      ? previewRenderIndex
      : committedLastAssistantIndex;
  const lastMessageIndex = displayMessages.length - 1;
  const isRunStreaming = runPhase === 'streaming';

  const topOverlayRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputAreaHandle>(null);
  const {
    activePlans,
    pendingPlanReview,
    approvePlanReview,
    abortPlanReview,
    refreshPlans,
  } = useTaskPlan(chatUuid);
  useToolConfirmations(chatUuid);
  useToolUserQuestions(chatUuid);
  useSubagentRuntime(chatUuid);
  useScheduleNotifications(chatUuid);
  const displayPlans = pendingPlanReview
    ? [pendingPlanReview.plan, ...activePlans]
    : activePlans;
  const [topOverlayHeight, setTopOverlayHeight] = useState<number>(
    CHAT_HEADER_OCCLUSION_PX,
  );
  const topOcclusionPx =
    displayPlans.length > 0 ? topOverlayHeight : CHAT_HEADER_OCCLUSION_PX;

  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [isWelcomeExiting, setIsWelcomeExiting] = useState<boolean>(false);
  const [isWelcomeComposerFocused, setIsWelcomeComposerFocused] =
    useState<boolean>(false);
  const hasShownWelcomeRef = useRef<boolean>(false);

  const handleWelcomeSuggestionClick = useCallback((prompt: string) => {
    chatInputRef.current?.fillInput(prompt);
  }, []);

  const hasVisibleTranscript = displayMessages.length > 0;
  const isWelcomeMode = showWelcome && !hasVisibleTranscript;
  const shouldRenderWelcomeStage =
    showWelcome &&
    (isWelcomeMode || isWelcomeExiting || !hasShownWelcomeRef.current);

  useLayoutEffect(() => {
    if (hasVisibleTranscript && showWelcome && !hasShownWelcomeRef.current) {
      hasShownWelcomeRef.current = true;
      setIsWelcomeComposerFocused(false);
      setIsWelcomeExiting(true);
      setTimeout((): void => {
        setShowWelcome(false);
        setIsWelcomeExiting(false);
      }, 220);
    }
  }, [hasVisibleTranscript, showWelcome]);

  useEffect(() => {
    if (!hasVisibleTranscript) {
      setShowWelcome(true);
      setIsWelcomeExiting(false);
      setIsWelcomeComposerFocused(false);
      hasShownWelcomeRef.current = false;
    }
  }, [chatUuid, hasVisibleTranscript]);

  useLayoutEffect(() => {
    if (displayPlans.length === 0) {
      setTopOverlayHeight(CHAT_HEADER_OCCLUSION_PX);
      return;
    }

    const overlay = topOverlayRef.current;
    if (!overlay) return;

    const measureOverlay = (): void => {
      const nextHeight = Math.max(
        CHAT_HEADER_OCCLUSION_PX,
        Math.ceil(overlay.getBoundingClientRect().height),
      );
      setTopOverlayHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };

    measureOverlay();
    const overlayObserver = new ResizeObserver(measureOverlay);
    overlayObserver.observe(overlay);

    return (): void => {
      overlayObserver.disconnect();
    };
  }, [displayPlans.length]);

  return (
    <>
      <ChatHeader />

      <div className="relative z-0 -mt-10 min-h-svh max-h-svh overflow-hidden flex flex-col bg-chat-light dark:bg-chat-dark">
        {shouldRenderWelcomeStage ? (
          <ChatSidePanelLayout
            open={artifactsPanelOpen}
            onClose={closeArtifactsPanel}
            preferenceKey={ARTIFACTS_SIDE_PANEL_PREFERENCE_KEY}
            sidePanelLabel="Artifacts panel"
            sidePanel={
              <div className="h-full w-full overflow-hidden pt-12">
                <ArtifactsPanel />
              </div>
            }
          >
            <div
              className={cn(
                'welcome-stage h-full',
                isWelcomeComposerFocused && 'welcome-stage-composer-focused',
                isWelcomeExiting && 'welcome-stage-exit',
              )}
            >
              <WelcomeMessage
                isExiting={isWelcomeExiting}
                isComposerFocused={isWelcomeComposerFocused}
                onSuggestionClick={handleWelcomeSuggestionClick}
                composer={
                  <ChatInputArea
                    ref={chatInputRef}
                    welcomeVisualMode
                    onWelcomeFocusStateChange={setIsWelcomeComposerFocused}
                  />
                }
              />
            </div>
          </ChatSidePanelLayout>
        ) : (
          <ResizablePanelGroup
            direction="vertical"
            className="grow overflow-hidden"
            id="vertical-panel-group"
          >
            <ResizablePanel
              id="main-content-panel"
              defaultSize={75}
              minSize={30}
              maxSize={85}
              className="flex flex-col overflow-hidden"
            >
              <ChatSidePanelLayout
                open={artifactsPanelOpen}
                onClose={closeArtifactsPanel}
                preferenceKey={ARTIFACTS_SIDE_PANEL_PREFERENCE_KEY}
                sidePanelLabel="Artifacts panel"
                sidePanel={
                  <div className="h-full w-full overflow-hidden pt-12">
                    <ArtifactsPanel />
                  </div>
                }
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-40 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {displayPlans.length > 0 && (
                      <motion.div
                        ref={topOverlayRef}
                        className={cn(
                          'pointer-events-none relative px-2 pb-2',
                          'bg-chat-light/72 backdrop-blur-xl',
                          'dark:bg-chat-dark/72',
                          'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/45',
                          'dark:after:bg-white/10',
                        )}
                        style={CHAT_HEADER_OCCLUSION_PADDING_STYLE}
                        initial={{ y: -12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -12, opacity: 0 }}
                        transition={{
                          duration: 0.24,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <div
                          className={cn(
                            TRANSCRIPT_COLUMN_CLASS,
                            'pointer-events-auto space-y-2',
                          )}
                        >
                          {displayPlans.map((plan, index) => {
                            const isPendingReview =
                              pendingPlanReview?.plan.id === plan.id;
                            return (
                              <motion.div
                                key={plan.id}
                                initial={{ opacity: 0, y: -16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.24,
                                  ease: [0.22, 1, 0.36, 1],
                                  delay: index * 0.04,
                                }}
                              >
                                <TaskPlanBar
                                  plan={plan}
                                  onPlanUpdated={refreshPlans}
                                  onApprove={
                                    isPendingReview
                                      ? approvePlanReview
                                      : undefined
                                  }
                                  onAbort={
                                    isPendingReview
                                      ? abortPlanReview
                                      : undefined
                                  }
                                />
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <ChatTranscriptScroller
                  chatUuid={chatUuid}
                  displayMessages={displayMessages}
                  previewMessage={previewMessage ?? undefined}
                  previewRenderIndex={previewRenderIndex}
                  lastAssistantIndex={lastAssistantIndex}
                  lastMessageIndex={lastMessageIndex}
                  latestUserIndex={latestUserIndex}
                  hasCurrentTurnAssistant={hasCurrentTurnAssistant}
                  shouldRenderPendingAssistant={shouldRenderPendingAssistant}
                  pendingAssistantModel={pendingAssistantModel}
                  topOcclusionPx={topOcclusionPx}
                  isRunStreaming={isRunStreaming}
                />
              </ChatSidePanelLayout>
            </ResizablePanel>

            <ResizableHandle className="hover:bg-primary/10 active:bg-primary/20 bg-transparent transition-colors duration-200 [&>div]:hidden [&::before]:hidden" />

            <ResizablePanel
              id="input-panel"
              defaultSize={20}
              minSize={10}
              maxSize={70}
              className="relative bg-transparent"
              style={{ overflow: 'visible' }}
            >
              <div className="pointer-events-none absolute inset-x-0 bottom-full z-50 mb-2 grid gap-1 px-2">
                <ChatInputUserQuestion className="pointer-events-auto px-0 pb-0" />
                <ChatInputToolConfirmation className="pointer-events-auto px-0 pb-0" />
              </div>

              <div className="h-full overflow-hidden">
                <ChatInputArea ref={chatInputRef} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </>
  );
};

export default ChatWindow;
