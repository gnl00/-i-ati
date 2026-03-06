import ChatScheduleBoard from '@renderer/components/chat/schedule/ChatScheduleBoard'
import ChatTitleList from '@renderer/components/chat/title/ChatTitleList'
import { Button } from '@renderer/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@renderer/components/ui/sheet'
import TrafficLights from '@renderer/components/ui/traffic-lights'
import { toast } from '@renderer/components/ui/use-toast'
import { getAllChat } from '@renderer/db/ChatRepository'
import { invokeDbScheduledTasksByChatUuid, subscribeScheduleEvents } from '@renderer/invoker/ipcInvoker'
import { useChatStore } from '@renderer/store'
import { useSheetStore } from '@renderer/store/sheet'
import { switchWorkspace } from '@renderer/utils/workspaceUtils'
import { BadgePlus } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ScheduleTask } from '@shared/tools/schedule'

interface ChatSheetProps { }

const ChatSheetComponent: React.FC<ChatSheetProps> = (_: ChatSheetProps) => {
    const { sheetOpenState, setSheetOpenState } = useSheetStore()
    const {
        clearMessages,
        upsertMessage,
        updateMessage,
        loadMessagesByChatId,
        toggleArtifacts,
        toggleWebSearch,
        currentChatId: chatId,
        currentChatUuid: chatUuid,
        setChatList,
        setChatTitle,
        setChatUuid,
        setChatId,
        setCurrentChat,
        setSelectedModelRef,
        selectedModelRef
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
                updateMessage({
                    ...msg,
                    body: {
                        ...msg.body,
                        typewriterCompleted: true
                    }
                })
            )
        ).catch(err => {
            console.error('[ChatSheet] Failed to batch update typewriterCompleted:', err)
        })
    }

    const [scheduledTasks, setScheduledTasks] = useState<ScheduleTask[]>([])
    const [scheduleLoading, setScheduleLoading] = useState(false)
    const [scheduleLoadError, setScheduleLoadError] = useState('')
    const scheduleCacheRef = useRef<Map<string, ScheduleTask[]>>(new Map())
    const scheduleLoadedRef = useRef<Set<string>>(new Set())

    const loadScheduledTasks = useCallback(async (
        targetChatUuid?: string | null,
        options?: { silent?: boolean; force?: boolean }
    ) => {
        if (!targetChatUuid) {
            setScheduledTasks([])
            setScheduleLoadError('')
            setScheduleLoading(false)
            return
        }

        const silent = options?.silent ?? false
        const force = options?.force ?? false
        const alreadyLoaded = scheduleLoadedRef.current.has(targetChatUuid)
        if (!force && alreadyLoaded) {
            return
        }

        if (!silent) {
            setScheduleLoading(true)
        }
        try {
            const tasks = await invokeDbScheduledTasksByChatUuid(targetChatUuid)
            const sortedTasks = [...tasks].sort((a, b) => a.run_at - b.run_at)
            scheduleCacheRef.current.set(targetChatUuid, sortedTasks)
            scheduleLoadedRef.current.add(targetChatUuid)
            setScheduledTasks(sortedTasks)
            setScheduleLoadError('')
        } catch (error) {
            console.error('[ChatSheet] Failed to load scheduled tasks:', error)
            scheduleLoadedRef.current.delete(targetChatUuid)
            if (!silent) {
                setScheduledTasks([])
            }
            setScheduleLoadError('Failed to load schedule tasks')
        } finally {
            if (!silent) {
                setScheduleLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        if (sheetOpenState) {
            const refreshChatList = () => {
                getAllChat().then(res => {
                    setChatList([...res, { id: -1, title: '', uuid: '', createTime: 0, updateTime: 0, messages: [] }])
                }).catch(err => {
                    console.error('refreshChatList', err)
                })
            }
            refreshChatList()
        }
    }, [sheetOpenState, setChatList])

    useEffect(() => {
        if (!sheetOpenState) {
            return
        }

        if (!chatUuid) {
            setScheduledTasks([])
            setScheduleLoadError('')
            setScheduleLoading(false)
            return
        }

        const cachedTasks = scheduleCacheRef.current.get(chatUuid)
        if (cachedTasks) {
            setScheduledTasks(cachedTasks)
            setScheduleLoadError('')
            setScheduleLoading(false)
        }

        const shouldSilentLoad = Boolean(cachedTasks)
        loadScheduledTasks(chatUuid, { silent: shouldSilentLoad })
    }, [chatUuid, loadScheduledTasks, sheetOpenState])

    useEffect(() => {
        const unsubscribe = subscribeScheduleEvents(event => {
            if (event.type !== 'schedule.updated') {
                return
            }
            const task = event.payload?.task
            if (!task || task.chat_uuid !== chatUuid) {
                return
            }
            setScheduledTasks(prev => {
                const index = prev.findIndex(item => item.id === task.id)
                const next = index >= 0
                    ? [...prev.slice(0, index), task, ...prev.slice(index + 1)]
                    : [task, ...prev]
                const sorted = next.sort((a, b) => a.run_at - b.run_at)
                scheduleCacheRef.current.set(task.chat_uuid, sorted)
                scheduleLoadedRef.current.add(task.chat_uuid)
                return sorted
            })
        })
        return () => {
            unsubscribe()
        }
    }, [chatUuid])

    const onNewChatClick = (_) => {
        setSheetOpenState(false)
        console.log('current chatId ', chatId, 'chatUuid ', chatUuid)
        if ((chatId && chatUuid) || !chatId || !chatUuid) {
            startNewChat()
        }
    }

    const startNewChat = async () => {
        // 批量完成当前 chat 的所有打字机效果
        await completeAllTypewriters()

        setChatId(null)
        setChatUuid(null)
        setChatTitle('NewChat')
        clearMessages()

        // 切换到默认 workspace (tmp)
        const workspaceResult = await switchWorkspace()
        if (!workspaceResult.success) {
            console.warn(`[Workspace] Failed to switch to default workspace:`, workspaceResult.error)
        }

        toggleArtifacts(false)
        toggleWebSearch(false)
    }

    const onChatClick = async (_, chat: ChatEntity) => {
        setSheetOpenState(false)
        if (chatId != chat.id) {
            // 批量完成当前 chat 的所有打字机效果
            await completeAllTypewriters()

            toggleArtifacts(false)
            toggleWebSearch(false)

            // 切换 workspace
            const workspaceResult = await switchWorkspace(chat.uuid)
            if (!workspaceResult.success) {
                console.warn(`[Workspace] Failed to switch workspace for chat ${chat.uuid}:`, workspaceResult.error)
            }

            setCurrentChat(chat.id ?? null, chat.uuid)
            setChatTitle(chat.title)

            if (chat.id) {
                loadMessagesByChatId(chat.id).then(messageList => {

                    if (!selectedModelRef) {
                        const lastWithModelRef = [...messageList]
                            .reverse()
                            .find(msg => msg.body.role === 'assistant' && msg.body.modelRef)
                        if (lastWithModelRef?.body.modelRef) {
                            setSelectedModelRef({
                                accountId: lastWithModelRef.body.modelRef.accountId,
                                modelId: lastWithModelRef.body.modelRef.modelId
                            })
                        }
                    }
                }).catch(err => {
                    toast({
                        variant: "destructive",
                        title: "Uh oh! Something went wrong.",
                        description: `There was a problem: ${err.message}`
                    })
                })
            } else {
                clearMessages()
            }
        }
    }

    return (
        <Sheet open={sheetOpenState} onOpenChange={() => { setSheetOpenState(!sheetOpenState) }}>
            <SheetContent side={"left"} className="[&>button]:hidden w-full outline-0 focus:outline-0 select-none flex flex-col h-full">
                {/* Traffic Lights in Sheet */}
                <div className="absolute top-4 left-4 z-50">
                    <TrafficLights />
                </div>

                {/* Header - 固定高度 */}
                <SheetHeader className="shrink-0 pt-4">
                    <SheetTitle>@i-ati</SheetTitle>
                    <SheetDescription>
                        -
                    </SheetDescription>
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
                        <span>v1.0.0</span>
                        <div className="flex items-center gap-2">
                            <a href="#" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">GitHub</a>
                            <span>·</span>
                            <a href="#" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Docs</a>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}

export default ChatSheetComponent;
