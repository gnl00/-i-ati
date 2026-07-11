import ChatScheduleBoard from '@renderer/features/chat/schedule/ChatScheduleBoard'
import ChatTitleList from '@renderer/features/chat/title/ChatTitleList'
import { Button } from '@renderer/shared/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@renderer/shared/components/ui/sheet'
import TrafficLights from '@renderer/shared/components/ui/traffic-lights'
import { toast } from '@renderer/shared/components/ui/use-toast'
import { getAllChat } from '@renderer/infrastructure/persistence/ChatRepository'
import {
    invokeDbScheduledTasksList,
    invokeOpenExternal,
    invokeWindowClose,
    invokeWindowMaximize,
    invokeWindowMinimize,
    subscribeScheduleEvents
} from '@renderer/infrastructure/ipc'
import { createRendererLogger } from '@renderer/shared/logging/rendererLogger'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import { useSheetStore } from '@renderer/features/chat/state/sheetStore'
import { switchWorkspace } from '@renderer/features/workspace'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { BadgePlus } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ScheduleTask, ScheduleTaskStatus } from '@shared/tools/schedule'

interface ChatSheetProps { }

const HIDDEN_SCHEDULE_STATUSES = new Set<ScheduleTaskStatus>(['cancelled', 'dismissed'])

const SCHEDULE_PRIORITY: Record<ScheduleTaskStatus, number> = {
    running: 0,
    pending: 1,
    completed: 2,
    failed: 2,
    cancelled: 3,
    dismissed: 4
}

const normalizeScheduledTasks = (tasks: ScheduleTask[]): ScheduleTask[] => {
    return [...tasks]
        .filter(task => !HIDDEN_SCHEDULE_STATUSES.has(task.status))
        .sort((a, b) => {
            const priorityDiff = SCHEDULE_PRIORITY[a.status] - SCHEDULE_PRIORITY[b.status]
            if (priorityDiff !== 0) return priorityDiff

            const runAtDiff = b.run_at - a.run_at
            if (runAtDiff !== 0) return runAtDiff

            const updatedAtDiff = b.updated_at - a.updated_at
            if (updatedAtDiff !== 0) return updatedAtDiff

            return b.created_at - a.created_at
        })
}

const CHAT_LIST_SENTINEL: ChatEntity = { id: -1, title: '', uuid: '', createTime: 0, updateTime: 0, messages: [] }
const SHEET_OPEN_ANIMATION_MS = 500

const appendChatListSentinel = (list: ChatEntity[]): ChatEntity[] => [...list, CHAT_LIST_SENTINEL]

const areChatListEntriesEquivalent = (current: ChatEntity, next: ChatEntity): boolean => {
    return current.id === next.id
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

const ChatSheet: React.FC<ChatSheetProps> = (_: ChatSheetProps) => {
    const logger = React.useMemo(() => createRendererLogger('ChatSheet'), [])
    const { sheetOpenState, setSheetOpenState } = useSheetStore()
    const { appVersion } = useAppConfigStore()
    const {
        upsertMessage,
        patchMessageUiState,
        toggleArtifacts,
        toggleWebSearch,
        setScrollHint,
        currentChatId: chatId,
        currentChatUuid: chatUuid,
        replaceChatList,
        hydrateChat,
        resetChatContext,
    } = useChatStore()

    /**
     * 批量完成当前 chat 的所有消息的打字机效果
     * 用于切换 chat 或开始新 chat 时
     */
    const completeAllTypewriters = async () => {
        const currentMessages = useChatStore.getState().messages

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
    }

    const [scheduledTasks, setScheduledTasks] = useState<ScheduleTask[]>([])
    const [scheduleLoading, setScheduleLoading] = useState(true)
    const [scheduleLoadError, setScheduleLoadError] = useState('')
    const scheduleCacheRef = useRef<ScheduleTask[] | null>(null)
    const scheduleLoadedRef = useRef(false)
    const chatSwitchRequestRef = useRef(0)
    const delayedChatListRefreshRef = useRef<number>(0)

    const loadScheduledTasks = useCallback(async (
        options?: { silent?: boolean; force?: boolean }
    ) => {
        const silent = options?.silent ?? false
        const force = options?.force ?? false
        if (!force && scheduleLoadedRef.current) {
            setScheduleLoading(false)
            return
        }

        if (!silent) {
            setScheduleLoading(true)
        }
        try {
            const tasks = await invokeDbScheduledTasksList()
            const sortedTasks = normalizeScheduledTasks(tasks)
            scheduleCacheRef.current = sortedTasks
            scheduleLoadedRef.current = true
            setScheduledTasks(sortedTasks)
            setScheduleLoadError('')
        } catch (error) {
            logger.error('scheduled_tasks.load_failed', error)
            scheduleLoadedRef.current = false
            if (!silent) {
                setScheduledTasks([])
            }
            setScheduleLoadError('Failed to load schedule tasks')
        } finally {
            setScheduleLoading(false)
        }
    }, [])

    const refreshChatList = useCallback(async () => {
        try {
            const res = await getAllChat()
            const nextChatList = appendChatListSentinel(res)
            const currentChatList = useChatStore.getState().chatList
            if (areChatListsEquivalent(currentChatList, nextChatList)) {
                return
            }
            replaceChatList(nextChatList)
        } catch (err) {
            logger.error('chat_list.refresh_failed', err)
        }
    }, [logger, replaceChatList])

    useEffect(() => {
        void refreshChatList()
        void loadScheduledTasks({ silent: true })
    }, [loadScheduledTasks, refreshChatList])

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

        return () => {
            if (delayedChatListRefreshRef.current) {
                window.clearTimeout(delayedChatListRefreshRef.current)
                delayedChatListRefreshRef.current = 0
            }
        }
    }, [refreshChatList, sheetOpenState])

    useEffect(() => {
        if (!sheetOpenState) {
            return
        }

        const cachedTasks = scheduleCacheRef.current
        if (cachedTasks) {
            setScheduledTasks(cachedTasks)
            setScheduleLoadError('')
            setScheduleLoading(false)
        }

        const shouldSilentLoad = Boolean(cachedTasks)
        loadScheduledTasks({ silent: shouldSilentLoad })
    }, [loadScheduledTasks, sheetOpenState])

    useEffect(() => {
        const unsubscribe = subscribeScheduleEvents(event => {
            if (event.type !== SCHEDULE_EVENTS.UPDATED) {
                return
            }
            const task = event.payload?.task
            if (!task) {
                return
            }
            setScheduledTasks(prev => {
                const index = prev.findIndex(item => item.id === task.id)
                const next =
                    index >= 0
                        ? [...prev.slice(0, index), task, ...prev.slice(index + 1)]
                        : [task, ...prev]
                const sorted = normalizeScheduledTasks(next)
                scheduleCacheRef.current = sorted
                return sorted
            })
        })
        return () => {
            unsubscribe()
        }
    }, [])

    const onNewChatClick = (_) => {
        setSheetOpenState(false)
        logger.debug('new_chat.clicked', { chatId, chatUuid })
        if ((chatId && chatUuid) || !chatId || !chatUuid) {
            startNewChat()
        }
    }

    const startNewChat = async () => {
        const requestId = ++chatSwitchRequestRef.current

        // 批量完成当前 chat 的所有打字机效果
        await completeAllTypewriters()
        if (chatSwitchRequestRef.current !== requestId) {
            return
        }

        resetChatContext()

        // 切换到默认 workspace (tmp)
        const workspaceResult = await switchWorkspace()
        if (!workspaceResult.success) {
            logger.warn('workspace.switch_default_failed', { error: workspaceResult.error })
        }

        toggleArtifacts(false)
        toggleWebSearch(false)
    }

    const onChatClick = async (_: React.MouseEvent<HTMLDivElement>, result: ChatSearchResult) => {
        const { chat, matchedMessageId } = result
        setSheetOpenState(false)

        if (chatId === chat.id) {
            if (matchedMessageId && chat.uuid) {
                setScrollHint({
                    type: 'search-result',
                    chatUuid: chat.uuid,
                    messageId: matchedMessageId
                })
            }
            return
        }

        if (chatId != chat.id) {
            const requestId = ++chatSwitchRequestRef.current

            // 批量完成当前 chat 的所有打字机效果
            await completeAllTypewriters()
            if (chatSwitchRequestRef.current !== requestId) {
                return
            }

            toggleArtifacts(false)
            toggleWebSearch(false)

            // 切换 workspace
            const workspaceResult = await switchWorkspace(chat.uuid, chat.workspacePath)
            if (!workspaceResult.success) {
                logger.warn('workspace.switch_for_chat_failed', { chatUuid: chat.uuid, error: workspaceResult.error })
            }
            if (chatSwitchRequestRef.current !== requestId) {
                return
            }

            if (!chat.id) {
                resetChatContext()
                return
            }

            try {
                await hydrateChat(chat.id)
                if (chatSwitchRequestRef.current !== requestId) {
                    return
                }
                if (matchedMessageId) {
                    setScrollHint({
                        type: 'search-result',
                        chatUuid: chat.uuid,
                        messageId: matchedMessageId
                    })
                }
            } catch (err: any) {
                toast({
                    variant: "destructive",
                    title: "Uh oh! Something went wrong.",
                    description: `There was a problem: ${err.message}`
                })
            }
        }
    }

    return (
        <Sheet open={sheetOpenState} onOpenChange={() => { setSheetOpenState(!sheetOpenState) }}>
            <SheetContent side={"left"} className="[&>button]:hidden w-full outline-0 focus:outline-0 select-none flex flex-col h-full">
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
                    <ChatScheduleBoard
                        scheduledTasks={scheduledTasks}
                        scheduleLoading={scheduleLoading}
                        scheduleLoadError={scheduleLoadError}
                    />

                    {/* 聊天列表区域 - 占据剩余空间 */}
                    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                        {/* New Chat 按钮 */}
                        <div className="shrink-0 py-3">
                            <Button
                                onClick={onNewChatClick}
                                variant={"default"}
                                className="w-full p-2.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-lg shadow-xs bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900"
                            >
                                <BadgePlus className='w-4 h-4' />
                                <span className="ml-2">New Chat</span>
                            </Button>
                        </div>

                        {/* 聊天标题列表 */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
                            <ChatTitleList
                                onChatClick={onChatClick}
                                onDeletedCurrentChat={startNewChat}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer - 固定在底部 */}
                <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>v{appVersion}</span>
                        <div className="flex items-center gap-2">
                            <a
                                id="github"
                                href="https://github.com/gnl00/-i-ati"
                                onClick={(event) => {
                                    event.preventDefault()
                                    void invokeOpenExternal('https://github.com/gnl00/-i-ati')
                                }}
                                className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                            >
                                GitHub
                            </a>
                            <span>·</span>
                            <a
                                id="plugins"
                                href="https://github.com/gnl00/atiapp-plugins"
                                onClick={(event) => {
                                    event.preventDefault()
                                    void invokeOpenExternal('https://github.com/gnl00/atiapp-plugins')
                                }}
                                className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                            >
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
