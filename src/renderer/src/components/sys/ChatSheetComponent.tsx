import React, { useEffect, useMemo, useState } from 'react'
import { CheckIcon, Pencil2Icon, Cross2Icon } from '@radix-ui/react-icons'
import { Card, CardContent } from '../ui/card'
import { Carousel, CarouselItem, CarouselContent, CarouselNext, CarouselPrevious } from '../ui/carousel'
import { Sheet, SheetDescription, SheetTitle, SheetHeader, SheetContent } from '../ui/sheet'
import { cn } from '@renderer/lib/utils'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '../ui/drawer'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Separator } from '../ui/separator'
import { deleteChat, getAllChat } from '@renderer/db/ChatRepository'
import { toast as sonnerToast } from 'sonner'
import { toast } from '@renderer/components/ui/use-toast'
import { updateChat } from '@renderer/db/ChatRepository'
import { getMessageByIds } from '@renderer/db/MessageRepository'
import { useChatContext } from '@renderer/context/ChatContext'
import { useSheetStore } from '@renderer/store/sheet'
import { useChatStore } from '@renderer/store'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from "@renderer/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { ChevronsUpDown } from 'lucide-react'
import TrafficLights from '@renderer/components/ui/traffic-lights'

interface ChatSheetProps {}

const ChatSheetComponent: React.FC<ChatSheetProps> = (props: ChatSheetProps) => {
    const { sheetOpenState, setSheetOpenState } = useSheetStore()
    const { setMessages, toggleArtifacts, toggleWebSearch, providers } = useChatStore()
    const {chatId, chatUuid, chatList, setChatList, setChatTitle, setChatUuid, setChatId, updateChatList} = useChatContext()
    
    const bgGradientTypes = useMemo(() => ['bg-gradient-to-t', 'bg-gradient-to-tr', 'bg-gradient-to-r', 'bg-gradient-to-br', 'bg-gradient-to-b', 'bg-gradient-to-bl', 'bg-gradient-to-l', 'bg-gradient-to-tl'], [])
    const bgGradientColors = useMemo(() => [
        { from: 'from-[#FFD26F]', via: 'via-[#3687FF]', to: 'to-[#3677FF]' },
        { from: 'from-[#43CBFF]', via: 'via-[#9708CC]', to: 'to-[#9708CC]' },
        { from: 'from-[#4158D0]', via: 'via-[#C850C0]', to: 'to-[#FFCC70]' },
        { from: 'from-[#FFFFFF]', via: 'via-[#6284FF]', to: 'to-[#FF0000]' },
        { from: 'from-[#00DBDE]', via: 'via-[#6284FF]', to: 'to-[#FC00FF]' },
    ], [])
    const [sheetChatItemHover, setSheetChatItemHover] = useState(false)
    const [sheetChatItemHoverChatId, setSheetChatItemHoverChatId] = useState<number>()
    const [showChatItemEditConform, setShowChatItemEditConform] = useState<boolean | undefined>(false)
    const [chatItemEditId, setChatItemEditId] = useState<number | undefined>()

    useEffect(() => {
        if(sheetOpenState) {
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

    const startNewChat = () => {
        setChatId(undefined)
        setChatUuid(undefined)
        setChatTitle('NewChat')
        setMessages([])

        toggleArtifacts(false)
        toggleWebSearch(false)
    }

    const onChatClick = (_, chat: ChatEntity) => {
        setSheetOpenState(false)
        if (chatId != chat.id) {
            toggleArtifacts(false)
            toggleWebSearch(false)

            setChatTitle(chat.title)
            setChatUuid(chat.uuid)
            setChatId(chat.id)
            getMessageByIds(chat.messages).then(messageList => {
                setMessages(messageList)
            }).catch(err => {
                toast({
                    variant: "destructive",
                    title: "Uh oh! Something went wrong.",
                    description: `There was a problem: ${err.message}`
                })
            })
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
        deleteChat(chat.id)
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
    return (
        <Sheet open={sheetOpenState} onOpenChange={() => {setSheetOpenState(!sheetOpenState)}}>
            <SheetContent side={"left"} className="[&>button]:hidden w-full outline-0 focus:outline-0 select-none">
                {/* Traffic Lights in Sheet */}
                <div className="absolute top-4 left-4 z-50">
                    <TrafficLights />
                </div>
                <SheetHeader className="pt-4">
                    <SheetTitle>@i-ati</SheetTitle>
                    <SheetDescription>
                        - Just an AI API client.
                    </SheetDescription>
                </SheetHeader>
                <div className="w-full h-full p-0 m-0 relative">
                    <div className="pl-8 pr-8 pt-4">
                        <Carousel className="w-full max-w-xs">
                            <CarouselContent>
                                <CarouselItem>
                                    <div className="h-full w-full">
                                        <Card>
                                            <CardContent className="bg-gradient-to-tl from-[#43CBFF] to-[#9708CC] bg-blur-lg flex h-full w-full aspect-square items-center justify-center p-6 select-none">
                                                <div className="">
                                                    <div className="container h-full w-full mx-auto px-4 py-12 text-white">
                                                        <p className="text-3xl">Hi</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </CarouselItem>
                                {
                                    Array.from({ length: 5 }).map((_, index) => (
                                        <CarouselItem key={index}>
                                            <div className="p-1">
                                                {/* TODO - Pinned assistant */}
                                                <Card>
                                                    <CardContent className={cn(
                                                        "flex bg-blur-xl h-full w-full aspect-square items-center justify-center p-6 select-none text-slate-50",
                                                        bgGradientTypes[index % bgGradientTypes.length],
                                                        bgGradientColors[index % bgGradientColors.length].from,
                                                        bgGradientColors[index % bgGradientColors.length].via,
                                                        bgGradientColors[index % bgGradientColors.length].to,
                                                    )}>
                                                        <span className="text-4xl font-semibold">Assistant-{index + 1}</span>
                                                    </CardContent>
                                                </Card>
                                            </div>
                                        </CarouselItem>
                                    ))
                                }
                                <CarouselItem onClick={_ => { console.log('add new assistant') }}>
                                    <div className="p-1">
                                        <Card>
                                            <CardContent className="flex flex-col aspect-square items-center justify-center p-6 select-none text-gray-300 hover:bg-gray-50">
                                                <Drawer>
                                                    <DrawerTrigger>
                                                        <p className="text-5xl font-semibold"><i className="ri-add-circle-line"></i></p>
                                                        <p>add new assistant</p>
                                                    </DrawerTrigger>
                                                    <DrawerContent>
                                                        <DrawerHeader>
                                                            <DrawerTitle>Add Assistant</DrawerTitle>
                                                            <DrawerDescription>Add your own custom assiatant.</DrawerDescription>
                                                        </DrawerHeader>
                                                        <div className='px-4 space-y-3'>
                                                            <div className="grid gap-3">
                                                                <Label>Name</Label>
                                                                <Input placeholder='Your assiatant name?' />
                                                            </div>
                                                            <div className="grid gap-3">
                                                                <Label>Model</Label>
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <Button
                                                                            variant="outline"
                                                                            role="combobox"
                                                                            className="w-[200px] justify-between"
                                                                            >
                                                                            {"Select framework..."}
                                                                            <ChevronsUpDown className="opacity-50" />
                                                                        </Button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-[200px] overflow-scroll p-0">
                                                                        <Command className='bg-red-100'>
                                                                            <CommandInput placeholder="Search framework..." className="h-9" />
                                                                            <CommandList className='overflow-scroll'>
                                                                                <CommandEmpty>No framework found.</CommandEmpty>
                                                                                {
                                                                                    providers.map(p => {
                                                                                        return p.models.length != 0 && p.models.findIndex(m => m.enable) !== -1 && (
                                                                                            <CommandGroup key={p.name}>
                                                                                                <p className='text-sm text-gray-400 select-none'>{p.name}</p>
                                                                                                {
                                                                                                    p.models.map(m => m.enable && (
                                                                                                        <CommandItem key={m.value.concat('/').concat(m.provider)} value={m.value.concat('/').concat(m.provider)}>
                                                                                                            {m.name}
                                                                                                        </CommandItem>
                                                                                                    ))
                                                                                                }
                                                                                            </CommandGroup>
                                                                                        )
                                                                                    })
                                                                                }
                                                                            </CommandList>
                                                                        </Command>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            </div>
                                                            <div className="grid gap-3">
                                                                <Label>Prompt</Label>
                                                                <Textarea placeholder="Your assistant prompts" />
                                                            </div>
                                                        </div>
                                                        <DrawerFooter>
                                                            <Button>Add</Button>
                                                            <DrawerClose asChild>
                                                                <Button variant="outline">Cancel</Button>
                                                            </DrawerClose>
                                                          </DrawerFooter>
                                                        </DrawerContent>
                                                    </Drawer>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </CarouselItem>
                            </CarouselContent>
                            <CarouselPrevious />
                            <CarouselNext />
                        </Carousel>
                    </div>
                    <div className="sheet-content h-full w-full">
                        <div className="flex flex-col justify-center w-full mt-8 max-h-[45%] overflow-y-scroll scroll-smooth rounded-md shadow-lg dark:shadow-gray-900 bg-inherit text-inherit">
                            <div className={cn("flex items-center justify-center rounded-md sticky top-0 bg-opacity-100 z-10")}>
                                <Button onClick={onNewChatClick} variant={"default"} className="w-full dark:w-[95%] p-2 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-md">Start NewChat</Button>
                            </div>
                            <div className="flex flex-col p-1 space-y-1 font-sans text-base font-normal overflow-x-scroll">
                                {
                                    chatList.length > 0 ? chatList.sort((a, b) => a.updateTime > b.updateTime ? -1 : 0).map((item, index) => {
                                        return (
                                            <div key={index}>
                                                {
                                                    (item.id !== -1 && item.updateTime > 0 && (index === 0 || (getDate(item.updateTime) != getDate(chatList[index-1].updateTime))) && (<div key={index}><span className='text-gray-500 text-xs'>{getDate(item.updateTime)}</span><Separator></Separator></div>))
                                                }
                                                {
                                                    index === chatList.length - 1 ?
                                                    <div key={-1} className="flex justify-center text-gray-300 dark:text-gray-700 select-none p-1">No more chats</div> :
                                                    (
                                                        <div id="chat-item"
                                                            onMouseOver={_ => onMouseOverSheetChat(item.id as number)}
                                                            onMouseLeave={onMouseLeaveSheetChat}
                                                            onClick={(event) => onChatClick(event, item)}
                                                            className={
                                                                cn("w-full flex item-center min-h-[4.8vh] pl-2 pr-2 space-x-2 rounded-lg select-none outline-dashed outline-1 outline-gray-100 dark:outline-gray-800",
                                                                    chatList.length !== 1 && item.id === chatId ? "bg-blue-gray-200 dark:bg-blue-gray-700" : "hover:bg-blue-gray-200 dark:hover:bg-blue-gray-700",
                                                                    index === chatList.length - 1 ? "" : ""
                                                                )}
                                                            >
                                                            <div className="flex items-center w-full flex-[0.8] overflow-x-hidden relative">
                                                                {
                                                                    showChatItemEditConform && chatItemEditId === item.id ?
                                                                        <Input
                                                                            className="focus-visible:ring-offset-0 focus-visible:ring-0 focus:ring-0 focus:outline-none focus:border-0 border-0"
                                                                            onClick={e => e.stopPropagation()}
                                                                            onChange={e => onChatItemTitleChange(e, item)}
                                                                            value={item.title}
                                                                        />
                                                                        :
                                                                        (<div className="flex items-center">
                                                                            <span className="text-ellipsis line-clamp-1 whitespace-no-wrap text-gray-600 text-sm font-semibold">{item.title}</span>
                                                                        </div>)
                                                                }
                                                            </div>
                                                            <div className="w-full flex flex-[0.2] items-center justify-center">
                                                                {(sheetChatItemHover && sheetChatItemHoverChatId === item.id ?
                                                                    <div className="flex space-x-2 item-center">
                                                                        {showChatItemEditConform && chatItemEditId === item.id ?
                                                                            <div className="flex items-center justify-center p-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-400  hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                                <span onClick={e => onSheetChatItemEditConformClick(e, item)} className="rounded-full px-1 py-1"><CheckIcon /></span>
                                                                            </div>
                                                                            :
                                                                            <div className="flex items-center justify-center p-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-400  hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                                <span onClick={e => onSheetChatItemEditClick(e, item)} className="rounded-full px-1 py-1"><Pencil2Icon /></span>
                                                                            </div>
                                                                        }
                                                                        <div className="flex items-center justify-center p-1 font-sans text-xs font-bold uppercase rounded-full select-none whitespace-nowrap text-gray-200 bg-red-500 hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                            <span onClick={e => onSheetChatItemDeleteClick(e, item)} className="rounded-full px-1 py-1 text-lg"><Cross2Icon /></span>
                                                                        </div>
                                                                    </div>
                                                                    :
                                                                    <div className="flex items-center px-2 py-1 font-sans text-xs font-bold uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-500">
                                                                        <span>{item.messages.length}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                            </div>
                                        )
                                    }) :
                                    (
                                        <div className={cn("flex items-center w-full p-3 rounded-md hover:bg-gray-100")} onClick={onNewChatClick}>
                                            NewChat
                                            <div className="grid ml-auto place-items-center justify-self-end">
                                                <div className="grid items-center px-2 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10">
                                                    <span>0</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                            </div>
                        </div>
                    </div>
                    <div className="sheet-footer absolute bottom-12 w-full select-none">
                        <div className="space-y-1">
                            <h4 className="text-sm font-medium leading-none">-</h4>
                            <p className="text-sm text-muted-foreground">
                                Based on React & Electron & ShadcnUI.
                            </p>
                        </div>
                        <Separator className="my-4" />
                        <div className="flex h-5 items-center space-x-4 text-sm">
                            <div>...</div>
                            <Separator orientation="vertical" />
                            <div>...</div>
                            <Separator orientation="vertical" />
                            <div>Source</div>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}

export default ChatSheetComponent;