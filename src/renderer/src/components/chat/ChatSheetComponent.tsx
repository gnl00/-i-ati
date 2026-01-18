import { CheckIcon, Cross2Icon, DoubleArrowRightIcon, Pencil2Icon } from '@radix-ui/react-icons'
import { Button } from '@renderer/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@renderer/components/ui/command"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@renderer/components/ui/drawer'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@renderer/components/ui/sheet'
import { Textarea } from '@renderer/components/ui/textarea'
import TrafficLights from '@renderer/components/ui/traffic-lights'
import { toast } from '@renderer/components/ui/use-toast'
import { useChatContext } from '@renderer/context/ChatContext'
import { deleteChat, getAllChat, updateChat } from '@renderer/db/ChatRepository'
import { getMessageByIds, updateMessage } from '@renderer/db/MessageRepository'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useSheetStore } from '@renderer/store/sheet'
import { switchWorkspace } from '@renderer/utils/workspaceUtils'
import { BadgePlus, ChevronsUpDown, } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { toast as sonnerToast } from 'sonner'

interface ChatSheetProps { }

// Assistant Card 组件
interface AssistantCardProps {
    label: string
    gradientType?: string
    gradientColors?: { from: string; via: string; to: string }
    className?: string
    onClick?: () => void
}

const AssistantCard: React.FC<AssistantCardProps> = ({
    label,
    gradientType = 'bg-gradient-to-br',
    gradientColors,
    className,
    onClick
}) => {
    return (
        <div
            onClick={onClick}
            className={cn(
                "group relative flex flex-col justify-between p-3 h-24 rounded-xl shadow-sm transition-all duration-300 cursor-pointer overflow-hidden ring-1 ring-black/5 dark:ring-white/10",
                "hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02]",
                gradientColors && [
                    gradientType,
                    gradientColors.from,
                    gradientColors.via,
                    gradientColors.to,
                ],
                className
            )}
        >
            {/* Decorative Background Character */}
            <div className="absolute -right-2 -top-4 opacity-10 text-7xl font-black text-black dark:text-white transform -rotate-12 transition-transform duration-500 group-hover:rotate-0 group-hover:scale-110 pointer-events-none select-none">
                {label.charAt(0)}
            </div>

            {/* Top Area (Empty for now, acts as spacer) */}
            <div className="w-full flex justify-end">
                {/* Optional: Status dot or icon could go here */}
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 group-hover:bg-white/80 transition-colors" />
            </div>

            {/* Label Area */}
            <div className="relative z-10">
                <p className="text-[10px] font-medium text-white/70 uppercase tracking-wider mb-0.5 transform translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    Assistant
                </p>
                <span className="text-base font-bold text-white leading-tight drop-shadow-sm tracking-tight">
                    {label}
                </span>
            </div>

            {/* Glass Shine Effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        </div>
    )
}

const ChatSheetComponent: React.FC<ChatSheetProps> = (props: ChatSheetProps) => {
    const { sheetOpenState, setSheetOpenState } = useSheetStore()
    const { setMessages, toggleArtifacts, toggleWebSearch } = useChatStore()
    const { accounts, providerDefinitions } = useAppConfigStore()
    const { chatId, chatUuid, chatList, setChatList, setChatTitle, setChatUuid, setChatId, updateChatList } = useChatContext()

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
        setMessages(completedMessages)

        // 批量更新数据库（异步，不阻塞 UI）
        Promise.all(
            messagesToUpdate.map(msg =>
                updateMessage({
                    id: msg.id!,
                    chatId: msg.chatId,
                    chatUuid: msg.chatUuid,
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

    const bgGradientTypes = useMemo(() => ['bg-gradient-to-t', 'bg-gradient-to-tr', 'bg-gradient-to-r', 'bg-gradient-to-br', 'bg-gradient-to-b', 'bg-gradient-to-bl', 'bg-gradient-to-l', 'bg-gradient-to-tl'], [])
    const bgGradientColors = useMemo(() => [
        { from: 'from-[#FFD26F]', via: 'via-[#3687FF]', to: 'to-[#3677FF]' },
        { from: 'from-[#43CBFF]', via: 'via-[#9708CC]', to: 'to-[#9708CC]' },
        { from: 'from-[#4158D0]', via: 'via-[#C850C0]', to: 'to-[#FFCC70]' },
        { from: 'from-[#FFFFFF]', via: 'via-[#6284FF]', to: 'to-[#FF0000]' },
        { from: 'from-[#00DBDE]', via: 'via-[#6284FF]', to: 'to-[#FC00FF]' },
    ], [])
    const modelGroups = useMemo(() => {
        const groups = new Map<string, { account: ProviderAccount; definition?: ProviderDefinition; models: AccountModel[] }>()
        accounts.forEach(account => {
            const definition = providerDefinitions.find(def => def.id === account.providerId)
            const enabledModels = account.models.filter(model => model.enabled !== false)
            if (enabledModels.length === 0) {
                return
            }
            groups.set(account.id, { account, definition, models: enabledModels })
        })
        return Array.from(groups.values())
    }, [accounts, providerDefinitions])
    const [sheetChatItemHover, setSheetChatItemHover] = useState(false)
    const [sheetChatItemHoverChatId, setSheetChatItemHoverChatId] = useState<number>()
    const [showChatItemEditConform, setShowChatItemEditConform] = useState<boolean | undefined>(false)
    const [chatItemEditId, setChatItemEditId] = useState<number | undefined>()
    const [isCarouselExpanded, setIsCarouselExpanded] = useState(false)

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
    }, [sheetOpenState])

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

        setChatId(undefined)
        setChatUuid(undefined)
        setChatTitle('NewChat')
        setMessages([])

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

            setChatTitle(chat.title)
            setChatUuid(chat.uuid)
            setChatId(chat.id)

            // 先获取完整的聊天数据（包含消息 ID 列表）
            const { getChatById } = await import('@renderer/db/ChatRepository')
            const fullChat = await getChatById(chat.id!)
            if (fullChat && fullChat.messages.length > 0) {
                getMessageByIds(fullChat.messages).then(messageList => {
                    setMessages(messageList)
                }).catch(err => {
                    toast({
                        variant: "destructive",
                        title: "Uh oh! Something went wrong.",
                        description: `There was a problem: ${err.message}`
                    })
                })
            } else {
                setMessages([])
            }
        }
    }
    const onChatItemTitleChange = (e, chat: ChatEntity) => {
        chat.title = e.target.value
        updateChat(chat)
        updateChatList(chat)
    }
    const onMouseOverSheetChat = (chatId) => {
        setSheetChatItemHover(true)
        setSheetChatItemHoverChatId(chatId)
    }
    const onMouseLeaveSheetChat = () => {
        setSheetChatItemHover(false)
        setSheetChatItemHoverChatId(-1)
    }
    const onSheetChatItemDeleteUndo = (chat: ChatEntity) => {
        setChatList([...chatList])
        updateChat(chat)
    }

    const onSheetChatItemDeleteClick = (e, chat: ChatEntity) => {
        e.stopPropagation()
        setChatList(chatList.filter(item => item.id !== chat.id))
        deleteChat(chat.id!)
        if (chat.id === chatId) {
            startNewChat()
        }
        sonnerToast.warning('Chat deleted', {
            action: {
                label: 'Undo',
                onClick: () => onSheetChatItemDeleteUndo(chat)
            },
        })
    }

    const onSheetChatItemEditConformClick = (e, _: ChatEntity) => {
        e.stopPropagation()
        setShowChatItemEditConform(false)
        setChatItemEditId(undefined)
    }

    const onSheetChatItemEditClick = (e, chat: ChatEntity) => {
        e.stopPropagation()
        setShowChatItemEditConform(true)
        if (chatItemEditId) {
            setChatItemEditId(undefined)
        } else {
            setChatItemEditId(chat.id)
        }
    }
    const getDate = (timestampe: number) => {
        const date = new Date(timestampe)
        const yyyy = date.getFullYear()
        const mm = String(date.getMonth() + 1).padStart(2, '0')
        const dd = String(date.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
    }

    const getDateGroup = (timestamp: number) => {
        const now = Date.now()
        const diff = now - timestamp
        const day = 24 * 60 * 60 * 1000

        if (diff < day) return 'Today'
        if (diff < 2 * day) return 'Yesterday'
        if (diff < 7 * day) return 'This Week'
        return getDate(timestamp)
    }

    // 排序后的聊天列表
    const sortedChatList = useMemo(() => {
        return [...chatList].sort((a, b) => b.updateTime - a.updateTime)
    }, [chatList])

    // 按日期分组的聊天列表
    const groupedChatList = useMemo(() => {
        const groups: { [key: string]: ChatEntity[] } = {}
        sortedChatList.forEach(item => {
            if (item.id === -1) return
            const group = getDateGroup(item.updateTime)
            if (!groups[group]) {
                groups[group] = []
            }
            groups[group].push(item)
        })
        return groups
    }, [sortedChatList])
    return (
        <Sheet open={sheetOpenState} onOpenChange={() => { setSheetOpenState(!sheetOpenState) }}>
            <SheetContent side={"left"} className="[&>button]:hidden w-full outline-0 focus:outline-0 select-none flex flex-col h-full">
                {/* Traffic Lights in Sheet */}
                <div className="absolute top-4 left-4 z-50">
                    <TrafficLights />
                </div>

                {/* Header - 固定高度 */}
                <SheetHeader className="flex-shrink-0 pt-4 pb-2">
                    <SheetTitle>@i-ati</SheetTitle>
                    <SheetDescription>
                        - Just an AI API client.
                    </SheetDescription>
                </SheetHeader>

                {/* 主内容区 - 占据剩余空间 */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {/* Carousel 区域 - 可折叠 */}
                    <div className="flex-shrink-0 px-4 pt-2 border rounded-xl">
                        <div className="flex items-center justify-between mb-2" onClick={() => setIsCarouselExpanded(!isCarouselExpanded)}>
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assistants</h3>
                            <button
                                className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
                            >
                                <DoubleArrowRightIcon className={cn("w-4 h-4 transition-transform duration-300", isCarouselExpanded ? 'rotate-90' : '')} />
                            </button>
                        </div>

                        <div className={cn(
                            "overflow-hidden transition-all duration-300 ease-out",
                            isCarouselExpanded ? "max-h-[240px]" : "max-h-[110px]"
                        )}>
                            <div className="grid grid-cols-4 gap-2 pb-2 pt-2">
                                {/* 第一行：始终显示 */}
                                {/* Hi 卡片 */}
                                <AssistantCard
                                    label="Hi"
                                    gradientColors={{ from: 'from-[#43CBFF]', via: 'via-[#9708CC]', to: 'to-[#9708CC]' }}
                                    className="text-lg"
                                />

                                {/* Assistant 1-3 */}
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <AssistantCard
                                        key={index}
                                        label={`A-${index + 1}`}
                                        gradientType={bgGradientTypes[index % bgGradientTypes.length]}
                                        gradientColors={bgGradientColors[index % bgGradientColors.length]}
                                    />
                                ))}

                                {/* 第二行：展开时显示，带淡入淡出动画 */}
                                {Array.from({ length: 2 }).map((_, index) => (
                                    <AssistantCard
                                        key={`second-row-${index}`}
                                        label={`A-${index + 4}`}
                                        gradientType={bgGradientTypes[(index + 3) % bgGradientTypes.length]}
                                        gradientColors={bgGradientColors[(index + 3) % bgGradientColors.length]}
                                        className={cn(
                                            isCarouselExpanded
                                                ? "opacity-100 translate-y-0"
                                                : "opacity-0 -translate-y-2 pointer-events-none"
                                        )}
                                    />
                                ))}

                                {/* Add 按钮 */}
                                <div
                                    className={cn(
                                        "flex flex-col items-center justify-center p-3 h-24 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-300 cursor-pointer group",
                                        isCarouselExpanded
                                            ? "opacity-100 translate-y-0"
                                            : "opacity-0 -translate-y-2 pointer-events-none"
                                    )}
                                >
                                    <Drawer>
                                        <DrawerTrigger asChild>
                                            <div className="flex flex-col items-center justify-center w-full h-full">
                                                <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 group-hover:scale-110 transition-transform duration-300">
                                                    <BadgePlus className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                                                </div>
                                                <p className="text-[10px] font-medium text-gray-400 mt-2 uppercase tracking-wide group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">Create</p>
                                            </div>
                                        </DrawerTrigger>
                                        <DrawerContent className="max-h-[85vh]">
                                            <DrawerHeader>
                                                <DrawerTitle>Create Assistant</DrawerTitle>
                                                <DrawerDescription>Customize your AI assistant with a name, model, and system prompt.</DrawerDescription>
                                            </DrawerHeader>
                                            <div className='px-4 pb-4 space-y-4 overflow-y-auto'>
                                                <div className="space-y-2">
                                                    <Label htmlFor="assistant-name" className="text-sm font-medium">
                                                        Name <span className="text-red-500">*</span>
                                                    </Label>
                                                    <Input
                                                        id="assistant-name"
                                                        placeholder='e.g., Code Helper, Writing Assistant'
                                                        className="w-full"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="assistant-model" className="text-sm font-medium">
                                                        Model <span className="text-red-500">*</span>
                                                    </Label>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button
                                                                id="assistant-model"
                                                                variant="outline"
                                                                role="combobox"
                                                                className="w-full justify-between"
                                                            >
                                                                {"Select a model..."}
                                                                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-full p-0" align="start">
                                                            <Command>
                                                                <CommandInput placeholder="Search models..." className="h-9" />
                                                                <CommandList className='overflow-scroll'>
                                                                    <CommandEmpty>No model found.</CommandEmpty>
                                                                    {
                                                                        modelGroups.map(group => (
                                                                            <CommandGroup key={group.account.id}>
                                                                                <p className='text-sm text-gray-400 select-none'>
                                                                                    {group.definition?.displayName || group.account.label}
                                                                                </p>
                                                                                {
                                                                                    group.models.map(model => (
                                                                                        <CommandItem
                                                                                            key={`${group.account.id}/${model.id}`}
                                                                                            value={`${group.account.id}/${model.id}`}
                                                                                        >
                                                                                            {model.label}
                                                                                        </CommandItem>
                                                                                    ))
                                                                                }
                                                                            </CommandGroup>
                                                                        ))
                                                                    }
                                                                </CommandList>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="assistant-prompt" className="text-sm font-medium">
                                                        System Prompt <span className="text-red-500">*</span>
                                                    </Label>
                                                    <Textarea
                                                        id="assistant-prompt"
                                                        placeholder="You are a helpful assistant that..."
                                                        className="w-full min-h-[120px] resize-none"
                                                    />
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        Define how your assistant should behave and respond.
                                                    </p>
                                                </div>
                                            </div>
                                            <DrawerFooter className="flex-row gap-2">
                                                <DrawerClose asChild>
                                                    <Button variant="outline" className="flex-1">Cancel</Button>
                                                </DrawerClose>
                                                <Button className="flex-1">Create Assistant</Button>
                                            </DrawerFooter>
                                        </DrawerContent>
                                    </Drawer>
                                </div>

                                {/* 第 8 个位置占位 */}
                                <div
                                    className={cn(
                                        "h-24 transition-all duration-300",
                                        isCarouselExpanded
                                            ? "opacity-100 translate-y-0"
                                            : "opacity-0 -translate-y-2"
                                    )}
                                ></div>
                            </div>
                        </div>
                    </div>

                    {/* 聊天列表区域 - 占据剩余空间 */}
                    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                        {/* New Chat 按钮 */}
                        <div className="flex-shrink-0 py-3">
                            <Button
                                onClick={onNewChatClick}
                                variant={"default"}
                                className="w-full p-2.5 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-lg shadow-sm bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900"
                            >
                                <BadgePlus className='w-4 h-4' />
                                <span className="ml-2">New Chat</span>
                            </Button>
                        </div>

                        {/* 聊天历史列表 */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
                            {Object.keys(groupedChatList).length > 0 ? (
                                <div>
                                    {Object.entries(groupedChatList).map(([groupName, items]) => (
                                        <div key={groupName} className="mb-2">
                                            {/* 日期分组标题 - sticky */}
                                            <div className="sticky top-0 bg-background/98 backdrop-blur-md z-10 pt-3 pb-2 px-3 mb-1 border-b border-gray-200 dark:border-gray-700 shadow-sm">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                                                    {groupName}
                                                </h4>
                                            </div>

                                            {/* 该分组下的聊天项 */}
                                            <div className="space-y-0.5 px-1">
                                                {items.map((item) => {
                                                    const isHovered = sheetChatItemHover && sheetChatItemHoverChatId === item.id
                                                    const isActive = item.id === chatId

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            id="chat-item"
                                                            onMouseOver={() => onMouseOverSheetChat(item.id as number)}
                                                            onMouseLeave={onMouseLeaveSheetChat}
                                                            onClick={(event) => onChatClick(event, item)}
                                                            className={cn(
                                                                "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
                                                                "transition-all duration-200 ease-out",
                                                                isActive
                                                                    ? "bg-gradient-to-r from-blue-50/80 via-blue-50/30 to-transparent dark:from-blue-900/20 dark:via-blue-900/10 dark:to-transparent after:content-[''] after:absolute after:bottom-0.5 after:left-3 after:w-48 after:h-0.5 after:bg-gradient-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:rounded-full hover:from-blue-50/90 hover:via-blue-50/40 dark:hover:from-blue-900/25 dark:hover:via-blue-900/15"
                                                                    : "hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-sm hover:scale-[1.01]"
                                                            )}
                                                        >
                                                            {/* 聊天标题 */}
                                                            <div className="flex-1 min-w-0">
                                                                {showChatItemEditConform && chatItemEditId === item.id ? (
                                                                    <Input
                                                                        className="h-7 text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent px-0"
                                                                        onClick={e => e.stopPropagation()}
                                                                        onChange={e => onChatItemTitleChange(e, item)}
                                                                        value={item.title}
                                                                        autoFocus
                                                                    />
                                                                ) : (
                                                                    <span className={cn(
                                                                        "text-sm font-medium text-gray-700 dark:text-gray-300 line-clamp-1 transition-colors duration-200",
                                                                        isHovered && "text-gray-900 dark:text-gray-100"
                                                                    )}>
                                                                        {item.title}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* 消息数量 / 操作按钮 */}
                                                            <div className="flex-shrink-0 flex items-center gap-1 h-7 relative w-16">
                                                                {/* 消息数量标签 */}
                                                                <span
                                                                    className={cn(
                                                                        "absolute inset-0 flex items-center justify-center px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full transition-all duration-200 ease-out",
                                                                        isHovered
                                                                            ? "opacity-0 scale-75 translate-x-2 pointer-events-none"
                                                                            : "opacity-100 scale-100 translate-x-0"
                                                                    )}
                                                                >
                                                                    {item.msgCount ?? 0}
                                                                </span>

                                                                {/* 操作按钮组 */}
                                                                <div
                                                                    className={cn(
                                                                        "absolute inset-0 flex items-center gap-1 transition-all duration-200 ease-out",
                                                                        isHovered
                                                                            ? "opacity-100 scale-100 translate-x-0"
                                                                            : "opacity-0 scale-75 -translate-x-2 pointer-events-none"
                                                                    )}
                                                                >
                                                                    {showChatItemEditConform && chatItemEditId === item.id ? (
                                                                        <button
                                                                            onClick={e => onSheetChatItemEditConformClick(e, item)}
                                                                            className={cn(
                                                                                "relative p-1.5 rounded-xl",
                                                                                "bg-emerald-50/80 dark:bg-emerald-950/40",
                                                                                "text-emerald-600 dark:text-emerald-400",
                                                                                "border border-emerald-200/50 dark:border-emerald-800/50",
                                                                                "shadow-inner",
                                                                                "transition-all duration-300 ease-out",
                                                                                "hover:scale-110",
                                                                                "hover:bg-emerald-100 dark:hover:bg-emerald-900/50",
                                                                                "hover:shadow-lg hover:shadow-emerald-500/10",
                                                                                "hover:-translate-y-0.5",
                                                                                "active:scale-95 active:shadow-inner active:translate-y-0"
                                                                            )}
                                                                        >
                                                                            <CheckIcon className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={e => onSheetChatItemEditClick(e, item)}
                                                                            className={cn(
                                                                                "relative p-1.5 rounded-xl",
                                                                                "bg-slate-100/80 dark:bg-slate-800/60",
                                                                                "text-slate-600 dark:text-slate-400",
                                                                                "border border-slate-200/50 dark:border-slate-700/50",
                                                                                "shadow-inner",
                                                                                "transition-all duration-300 ease-out",
                                                                                "hover:scale-110",
                                                                                "hover:bg-slate-200 dark:hover:bg-slate-700",
                                                                                "hover:shadow-lg hover:shadow-slate-500/10",
                                                                                "hover:-translate-y-0.5",
                                                                                "active:scale-95 active:shadow-inner active:translate-y-0"
                                                                            )}
                                                                        >
                                                                            <Pencil2Icon className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={e => onSheetChatItemDeleteClick(e, item)}
                                                                        className={cn(
                                                                            "relative p-1.5 rounded-xl",
                                                                            "bg-rose-50/80 dark:bg-rose-950/40",
                                                                            "text-rose-600 dark:text-rose-400",
                                                                            "border border-rose-200/50 dark:border-rose-800/50",
                                                                            "shadow-inner",
                                                                            "transition-all duration-300 ease-out",
                                                                            "hover:scale-110 hover:rotate-90",
                                                                            "hover:bg-rose-100 dark:hover:bg-rose-900/50",
                                                                            "hover:shadow-lg hover:shadow-rose-500/10",
                                                                            "hover:-translate-y-0.5",
                                                                            "active:scale-95 active:shadow-inner active:translate-y-0 active:rotate-90"
                                                                        )}
                                                                    >
                                                                        <Cross2Icon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}

                                    {/* 底部提示 */}
                                    <div className="py-4 text-center">
                                        <span className="text-xs text-gray-400 dark:text-gray-600">No more chats</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center text-gray-400 dark:text-gray-600">
                                        <p className="text-sm">No chats yet</p>
                                        <p className="text-xs mt-1">Start a new conversation</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer - 固定在底部 */}
                <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-800">
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
