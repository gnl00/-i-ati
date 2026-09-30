import { NextTaskSummary } from '../schedule/NextTaskSummary'
import ChatTitleList from '@renderer/features/chat/title/ChatTitleList'
import { Badge } from '@renderer/shared/components/ui/badge'
import { Button } from '@renderer/shared/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@renderer/shared/components/ui/sheet'
import TrafficLights from '@renderer/shared/components/ui/traffic-lights'
import { toast } from '@renderer/shared/components/ui/use-toast'
import { v4 as uuidv4 } from 'uuid'
import { getAllChat, saveChat } from '@renderer/infrastructure/persistence/ChatRepository'
import {
    invokeOpenExternal,
    invokeWindowClose,
    invokeWindowMaximize,
    invokeWindowMinimize
} from '@renderer/infrastructure/ipc'
import { createRendererLogger } from '@renderer/shared/logging/rendererLogger'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import { useSheetStore } from '@renderer/features/chat/state/sheetStore'
import { switchWorkspace } from '@renderer/features/workspace'
import { BadgePlus, Github, Puzzle } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
const CHAT_LIST_SENTINEL: ChatEntity = { id: -1, title: '', uuid: '', createTime: 0, updateTime: 0, messages: [] }
const SHEET_OPEN_ANIMATION_MS = 150

const appendChatListSentinel = (list: ChatEntity[]): ChatEntity[] => [...list, CHAT_LIST_SENTINEL]

const areChatListEntriesEquivalent = (current: ChatEntity, next: ChatEntity): boolean => {
    return current.isScheduled === next.isScheduled
        && current.id === next.id
        && current.uuid === next.uuid
        && current.title === next.title
        && current.updateTime === next.updateTime
        && current.createTime === next.createTime
        && current.msgCount === next.msgCount
        && current.workspacePath === next.workspacePath
        && current.userInstruction === next.userInstruction
}

const areChatListsEquivalent = (current: ChatEntity[], next: ChatEntity[]): boolean => {
    if (current.length !== next.length) {
        return false
    }

    return current.every((item, index) => areChatListEntriesEquivalent(item, next[index]))
}

const ChatSheet: React.FC = () => {
    const logger = React.useMemo(() => createRendererLogger('ChatSheet'), [])
    const [searchContainer, setSearchContainer] = useState<HTMLDivElement | null>(null)
    const sheetOpenState = useSheetStore(state => state.sheetOpenState)
    const setSheetOpenState = useSheetStore(state => state.setSheetOpenState)
    const appVersion = useAppConfigStore(state => state.appVersion)

    /**
     * 批量完成当前 chat 的所有消息的打字机效果
     * 用于切换 chat 或开始新 chat 时
     */
    const completeAllTypewriters = useCallback(async () => {
        const { messages: currentMessages, upsertMessage, patchMessageUiState } = useChatStore.getState()

        if (currentMessages.length === 0) {
            return
        }

        // 只更新 assistant 消息且未完成打字机的消息
        const messagesToUpdate = currentMessages.filter(msg =>
            msg.id &&
            msg.body.role === 'assistant' &&
            !msg.body.typewriterCompleted
        )

        if (messagesToUpdate.length === 0) {
            return
        }

        // 更新内存中的消息
        const completedMessages = currentMessages.map(msg => {
            if (msg.body.role === 'assistant' && !msg.body.typewriterCompleted) {
                return {
                    ...msg,
                    body: {
                        ...msg.body,
                        typewriterCompleted: true
                    }
                }
            }
            return msg
        })
        completedMessages.forEach(msg => upsertMessage(msg))

        // 批量更新数据库（异步，不阻塞 UI）
        Promise.all(
            messagesToUpdate.map(msg =>
                patchMessageUiState(msg.id as number, { typewriterCompleted: true })
            )
        ).catch(err => {
            logger.error('typewriter.batch_complete_failed', err)
        })
    }, [logger])

    const chatSwitchRequestRef = useRef(0)
    const delayedChatListRefreshRef = useRef<number>(0)

    const refreshChatList = useCallback(async () => {
        try {
            const res = await getAllChat()
            const nextChatList = appendChatListSentinel(res)
            const currentChatList = useChatStore.getState().chatList
            if (areChatListsEquivalent(currentChatList, nextChatList)) {
                return
            }
            useChatStore.getState().replaceChatList(nextChatList)
        } catch (err) {
            logger.error('chat_list.refresh_failed', err)
        }
    }, [logger])

    useEffect(() => {
        void refreshChatList()
    }, [refreshChatList])

    useEffect(() => {
        if (!sheetOpenState) {
            if (delayedChatListRefreshRef.current) {
                window.clearTimeout(delayedChatListRefreshRef.current)
                delayedChatListRefreshRef.current = 0
            }
            return
        }

        delayedChatListRefreshRef.current = window.setTimeout(() => {
            delayedChatListRefreshRef.current = 0
            void refreshChatList()
        }, SHEET_OPEN_ANIMATION_MS)

        return (): void => {
            if (delayedChatListRefreshRef.current) {
                window.clearTimeout(delayedChatListRefreshRef.current)
                delayedChatListRefreshRef.current = 0
            }
        }
    }, [refreshChatList, sheetOpenState])

    useEffect(() => {
        return (): void => {
            chatSwitchRequestRef.current += 1
            useSheetStore.getState().setChatLoading(false)
            useSheetStore.getState().setChatEntranceRequest(null)
        }
    }, [])

    const startNewChat = useCallback(async (workspacePath?: string) => {
        const requestId = ++chatSwitchRequestRef.current
        useSheetStore.getState().setChatLoading(false)
        useSheetStore.getState().setChatEntranceRequest(null)

        // 批量完成当前 chat 的所有打字机效果
        await completeAllTypewriters()
        if (chatSwitchRequestRef.current !== requestId) {
            return
        }

        useChatStore.getState().resetChatContext()

        // 切换到默认 workspace (tmp)
        const workspaceResult = await switchWorkspace(undefined, workspacePath)
        if (!workspaceResult.success) {
            logger.warn('workspace.switch_default_failed', { error: workspaceResult.error })
            if (workspacePath) {
                toast({ variant: 'destructive', title: 'Failed to select workspace', description: workspaceResult.error })
                return
            }
        }
        if (chatSwitchRequestRef.current !== requestId) {
            return
        }

        if (workspacePath) {
            const chat: ChatEntity = {
                uuid: uuidv4(), title: 'NewChat', messages: [],
                workspacePath: workspaceResult.path, createTime: Date.now(), updateTime: Date.now()
            }
            try {
                chat.id = await saveChat(chat)
                useChatStore.getState().prependChatListEntry(chat)
                if (chatSwitchRequestRef.current !== requestId) return
                useChatStore.getState().selectChatShell(chat.id, chat.uuid, chat)
            } catch (error) {
                logger.error('new_chat.workspace_create_failed', error)
                toast({ variant: 'destructive', title: 'Failed to create chat' })
                return
            }
        }
        useChatStore.getState().toggleWebSearch(false)
    }, [completeAllTypewriters, logger])

    const onNewWorkspaceChat = useCallback((path?: string) => {
        useChatStore.getState().setTasksPageOpen(false)
        setSheetOpenState(false)
        void startNewChat(path)
    }, [setSheetOpenState, startNewChat])

    const onNewChatClick = useCallback(() => {
        useChatStore.getState().setTasksPageOpen(false)
        const { currentChatId, currentChatUuid } = useChatStore.getState()
        setSheetOpenState(false)
        logger.debug('new_chat.clicked', { chatId: currentChatId, chatUuid: currentChatUuid })
        void startNewChat()
    }, [logger, setSheetOpenState, startNewChat])

    const onChatClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>, result: ChatSearchResult) => {
        useChatStore.getState().setTasksPageOpen(false)
        const isPointerInitiated = event.detail > 0
        const { chat, matchedMessageId } = result
        setSheetOpenState(false)

        const { currentChatId } = useChatStore.getState()
        if (currentChatId === chat.id) {
            chatSwitchRequestRef.current += 1
            useSheetStore.getState().setChatLoading(false)
            useSheetStore.getState().setChatEntranceRequest(null)
            if (matchedMessageId && chat.uuid) {
                useChatStore.getState().setScrollHint({
                    type: 'search-result',
                    chatUuid: chat.uuid,
                    messageId: matchedMessageId
                })
            }
            return
        }

        const requestId = ++chatSwitchRequestRef.current
        const selectionEpoch = useChatStore.getState().getSelectionEpoch()
        const isRequestActive = (): boolean => chatSwitchRequestRef.current === requestId
        const isCurrent = (): boolean => isRequestActive()
            && useChatStore.getState().getSelectionEpoch() === selectionEpoch
        useSheetStore.getState().setChatEntranceRequest(null)
        useSheetStore.getState().setChatLoading(true)

        try {
            // 批量完成当前 chat 的所有打字机效果
            await completeAllTypewriters()
            if (!isCurrent()) {
                return
            }

            useChatStore.getState().toggleWebSearch(false)

            // 切换 workspace
            const workspaceResult = await switchWorkspace(chat.uuid, chat.workspacePath)
            if (!workspaceResult.success) {
                logger.warn('workspace.switch_for_chat_failed', { chatUuid: chat.uuid, error: workspaceResult.error })
            }
            if (!isCurrent()) {
                return
            }

            if (!chat.id) {
                useChatStore.getState().resetChatContext()
                return
            }

            await useChatStore.getState().hydrateChat(chat.id, { isCurrent })
            if (!isCurrent()) {
                return
            }
            const { currentChatId, currentChatUuid } = useChatStore.getState()
            if (currentChatId !== chat.id || currentChatUuid !== chat.uuid) {
                return
            }
            if (isPointerInitiated && useChatStore.getState().messages.length > 0) {
                useSheetStore.getState().setChatEntranceRequest({
                    chatUuid: chat.uuid,
                    selectionEpoch
                })
            }
            if (matchedMessageId) {
                useChatStore.getState().setScrollHint({
                    type: 'search-result',
                    chatUuid: chat.uuid,
                    messageId: matchedMessageId
                })
            }
        } catch (err: unknown) {
            if (isCurrent()) {
                const message = err instanceof Error ? err.message : String(err)
                toast({
                    variant: "destructive",
                    title: "Uh oh! Something went wrong.",
                    description: `There was a problem: ${message}`
                })
            }
        } finally {
            if (isRequestActive()) {
                useSheetStore.getState().setChatLoading(false)
            }
        }
    }, [completeAllTypewriters, logger, setSheetOpenState])

    const onSheetOpenChange = useCallback((open: boolean) => {
        setSheetOpenState(open)
    }, [setSheetOpenState])

    return (
        <Sheet open={sheetOpenState} onOpenChange={onSheetOpenChange}>
            <SheetContent
                side={"left"}
                overlayClassName="bg-slate-950/18 dark:bg-(--app-scrim) dark:backdrop-blur-[2px]"
                className="data-[state=open]:duration-150 data-[state=open]:ease-out [&>button]:hidden w-full pb-3 outline-0 focus:outline-0 select-none flex flex-col h-full dark:border-(--app-border-standard) dark:bg-(--app-canvas) dark:text-(--app-text-primary) dark:shadow-2xl dark:shadow-black/35"
            >
                {/* Traffic Lights in Sheet */}
                <div className="absolute top-4 left-4 z-50">
                    <TrafficLights
                        onClose={invokeWindowClose}
                        onMinimize={invokeWindowMinimize}
                        onMaximize={invokeWindowMaximize}
                    />
                </div>

                {/* Header - needs both SheetTitle and SheetDescription to keep ui behavious right */}
                <SheetHeader>
                    <SheetTitle></SheetTitle>
                    <SheetDescription></SheetDescription>
                </SheetHeader>

                {/* 主内容区 - 占据剩余空间 */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {sheetOpenState && <NextTaskSummary />}
                    {/* 聊天列表区域 - 占据剩余空间 */}
                    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                        {/* New Chat 按钮 */}
                        <div className="app-undragable group/chat-actions grid shrink-0 grid-cols-[minmax(0,1fr)_36px] has-[[data-search-open=true]]:grid-cols-[minmax(0,1fr)_calc(100%-48px)] items-center gap-2 py-3 transition-[grid-template-columns] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none">
                            <Button
                                aria-label="New Chat"
                                title="New Chat"
                                onClick={onNewChatClick}
                                variant={"default"}
                                className="w-full p-2.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-lg shadow-xs bg-gray-900 hover:bg-gray-800 dark:border dark:border-white/10 dark:bg-[oklch(80%_0.012_250)] dark:text-(--app-canvas) dark:shadow-none dark:hover:bg-[oklch(84%_0.012_250)] dark:active:scale-[0.99]"
                            >
                                <BadgePlus className='w-4 h-4 shrink-0' />
                                <span className="ml-2 group-has-[[data-search-open=true]]/chat-actions:hidden">New Chat</span>
                            </Button>
                            <div ref={setSearchContainer} className="contents" />
                        </div>

                        {/* 聊天标题列表 */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth [scrollbar-gutter:stable]">
                            <ChatTitleList
                                onNewWorkspaceChat={onNewWorkspaceChat}
                                searchContainer={searchContainer}
                                onChatClick={onChatClick}
                                onDeletedCurrentChat={startNewChat}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer - 固定在底部 */}
                <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-(--app-border-subtle)">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-(--app-text-muted)">
                        <Badge variant="secondary" className="h-6 border-0 bg-(--app-surface-inset) px-2 text-[11px] font-normal text-(--app-text-muted) hover:bg-(--app-surface-inset) dark:bg-(--app-surface-raised) dark:hover:bg-(--app-surface-raised)">v{appVersion}</Badge>
                        <div className="flex items-center gap-1">
                            <a
                                id="github"
                                href="https://github.com/gnl00/-i-ati"
                                onClick={(event) => {
                                    event.preventDefault()
                                    void invokeOpenExternal('https://github.com/gnl00/-i-ati')
                                }}
                                className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text-primary) focus-visible:outline focus-visible:outline-(--app-accent)"
                            >
                                <Github aria-hidden="true" className="h-3 w-3 shrink-0" />
                                GitHub
                            </a>
                            <a
                                id="plugins"
                                href="https://github.com/gnl00/atiapp-plugins"
                                onClick={(event) => {
                                    event.preventDefault()
                                    void invokeOpenExternal('https://github.com/gnl00/atiapp-plugins')
                                }}
                                className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text-primary) focus-visible:outline focus-visible:outline-(--app-accent)"
                            >
                                <Puzzle aria-hidden="true" className="h-3 w-3 shrink-0" />
                                Plugins
                            </a>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}

export default ChatSheet;
