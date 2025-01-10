import { Button } from "@renderer/components/ui/button"
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@renderer/components/ui/resizable"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@renderer/components/ui/sheet"
import { Textarea } from '@renderer/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Toggle } from '@renderer/components/ui/toggle'
import { useToast } from "@renderer/components/ui/use-toast"
import { Toaster } from "@renderer/components/ui/toaster"
import { ToastAction } from "@renderer/components/ui/toast"
// import { toast as SonnerToast, Toaster as SonnerToaster } from "sonner"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@renderer/components/ui/tooltip"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
    DialogFooter
} from "@renderer/components/ui/dialog"
import { Switch } from "@renderer/components/ui/switch"
import { Badge } from '@renderer/components/ui/badge'
import { 
    PaperPlaneIcon, 
    GearIcon, 
    QuestionMarkCircledIcon, 
    DrawingPinIcon, 
    DrawingPinFilledIcon, 
    Pencil2Icon,
    CrossCircledIcon,
    SymbolIcon,
    ReloadIcon,
    Cross1Icon,
    CheckIcon,
    Cross2Icon,
    StopIcon,
    CopyIcon,
    PlusCircledIcon,
} from "@radix-ui/react-icons"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@renderer/components/ui/select"
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Separator } from "@renderer/components/ui/separator"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@renderer/components/ui/carousel"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@renderer/components/ui/card"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from "@renderer/components/ui/command"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuShortcut
} from "@renderer/components/ui/context-menu"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu"
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
  } from "@renderer/components/ui/drawer"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@renderer/lib/utils"
import React from 'react'
import { useEffect, useRef, useState, forwardRef, useLayoutEffect, useMemo, createContext, useContext } from "react"
import ReactMarkdown from 'react-markdown'
import { v4 as uuidv4 } from 'uuid';
import { PIN_WINDOW, GET_CONFIG, OPEN_EXTERNAL, SAVE_CONFIG } from '@constants/index'
import { chatRequestWithHook, chatRequestWithHookV2 } from '@request/index'
import { saveMessage, getMessageByIds, updateMessage } from '../db/MessageRepository'
import { getChatById, saveChat, updateChat, getAllChat, deleteChat } from '../db/ChatRepository'
import bgSvgBlack128 from '../assets/black-icon-128x128.svg'
import { ModeToggle } from "@renderer/components/mode-toggle"
import {PrismAsync as SyntaxHighlighter} from 'react-syntax-highlighter'
import {atomDark, darcula, dracula, duotoneDark, duotoneEarth, funky, ghcolors, oneDark} from 'react-syntax-highlighter/dist/esm/styles/prism'
import { AestheticFluidBg } from "../assets/color4bg.js/build/jsm/AestheticFluidBg.module.js"
import { gradientDark } from "react-syntax-highlighter/dist/esm/styles/hljs"
import { debounce } from 'lodash'
import { useDebouncedValue } from '@mantine/hooks'
import List from 'rc-virtual-list'
import { VList, VListHandle } from "virtua"
import InputArea from "@renderer/components/InputAreaComp"
import { ChatProvider, useChatContext } from "@renderer/context/ChatContext"
import ImageGalleryComp from "@renderer/components/ImageGalleryComp"

const models = [
    {
        provider: "Qwen",
        model: "Qwen2.5-7B-Instruct",
        value: "Qwen/Qwen2.5-7B-Instruct",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "Qwen",
        model: "Qwen2.5-14B-Instruct",
        value: "Qwen/Qwen2.5-14B-Instruct",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "Qwen",
        model: "Qwen2.5-32B-Instruct",
        value: "Qwen/Qwen2.5-32B-Instruct",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "Qwen",
        model: "Qwen2.5-72B-Instruct",
        value: "Qwen/Qwen2.5-72B-Instruct",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "Qwen",
        model: "Qwen2.5-Coder-7B-Instruct",
        value: "Qwen/Qwen2.5-Coder-7B-Instruct",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "Qwen",
        model: "Qwen2.5-Coder-32B-Instruct",
        value: "Qwen/Qwen2.5-Coder-32B-Instruct",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "Qwen",
        model: "Qwen2-VL-72B-Instruct",
        value: "Qwen/Qwen2-VL-72B-Instruct",
        type: 'vlm'
    },
    {
        provider: "deepseek-ai",
        model: "DeepSeek-V2.5",
        value: "deepseek-ai/DeepSeek-V2.5",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "deepseek-ai",
        model: "deepseek-vl2",
        value: "deepseek-ai/deepseek-vl2",
        type: 'vlm'
    },
]

const localProviders = [
    {
        name: "OpenAI",
        models: [],
        apiUrl: "https://api.openai.com/v1/chat/completions",
        apiKey: ''
    },
    {
        name: "Anthropic",
        models: [],
        apiUrl: "https://api.anthropic.com/v1/messages",
        apiKey: ''
    },
    {
        name: "DeepSeek",
        models: [],
        apiUrl: "https://api.deepseek.com",
        apiKey: ''
    },
    {
        name: "SilliconFlow",
        models: [],
        apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
        apiKey: ''
    },
    {
        name: "MoonShot",
        models: [],
        apiUrl: "https://api.moonshot.cn/v1",
        apiKey: ''
    }
]

const generateTitlePrompt = "Generate a briefly and precisely title from the context below. NOTE: RETURN ME THE TITLE ONLY.\n"

export default () => {
    // @ts-ignore
    const appVersion = __APP_VERSION__

    const { toast } = useToast()

    const [bgGradientTypes, setBgGradientTypes] = useState<string[]>(['bg-gradient-to-t', 'bg-gradient-to-tr', 'bg-gradient-to-r', 'bg-gradient-to-br', 'bg-gradient-to-b', 'bg-gradient-to-bl', 'bg-gradient-to-l', 'bg-gradient-to-tl'])
    const [bgGradientColors, setBgGradientColors] = useState<{from: string, via: string, to: string}[]>([
        {from: 'from-[#FFD26F]', via: 'via-[#3687FF]', to: 'to-[#3677FF]'},
        {from: 'from-[#43CBFF]', via: 'via-[#9708CC]', to: 'to-[#9708CC]'},
        {from: 'from-[#4158D0]', via: 'via-[#C850C0]', to: 'to-[#FFCC70]'},
        {from: 'from-[#FFFFFF]', via: 'via-[#6284FF]', to: 'to-[#FF0000]'},
        {from: 'from-[#00DBDE]', via: 'via-[#6284FF]', to: 'to-[#FC00FF]'},
    ])
    const [pinState, setPinState] = useState<boolean>(false)
    const [chatId, setChatId] = useState<number | undefined>()
    const [chatUuid, setChatUuid] = useState<string | undefined>()
    const [chatTitle, setChatTitle] = useState('NewChat')
    const [chatList, setChatList] = useState<ChatEntity[]>([])
    const [messageEntityList, setMessageEntityList] = useState<MessageEntity[]>([])
    const [lastMsgStatus, setLastMsgStatus] = useState<boolean>(false)
    const [customPrompt, setCustomPrompt] = useState('')
    const [useCustomePrompt, setUseCustomePrompt] = useState(false)
    const [appConfig, setAppConfig] = useState<IAppConfig>({
        api: 'https://api.siliconflow.cn/v1/chat/completions',
        token: '',
        prompt: {
            embedded: ''
        },
        model: 'Qwen/Qwen2.5-32B-Instruct'
    })
    const [providers, setProviders] = useState<any[]>(localProviders)
    const [selectedProvider, setSelectedProvider] = useState('SilliconFlow')
    const [selectedModel, setSelectedModel] = useState('Qwen/Qwen2.5-Coder-32B-Instruct')
    const [selectProviderPopoutState, setSelectProviderPopoutState] = useState(false)
    const [selectModelPopoutState, setSelectModelPopoutState] = useState(false)
    const [sheetOpenState, setSheetOpenState] = useState<boolean>(false)
    const [fetchState, setFetchState] = useState<boolean>()
    const [currentReqCtrl, setCurrReqCtrl] = useState<AbortController>()
    const [readStreamState, setReadStreamState] = useState<boolean>(false)
    const [chatItemEditId, setChatItemEditId] = useState<number | undefined>()
    const [showChatItemEditConform, setShowChatItemEditConform] = useState<boolean | undefined>(false)
    const [sheetChatItemHover, setSheetChatItemHover] = useState(false)
    const [sheetChatItemHoverChatId, setSheetChatItemHoverChatId] = useState<number>()
    const [iptImgHoverIndex, setIptImgHoverIndex] = useState(-1)
    const [sysEditableContentId, setSysEditableContentId] = useState(-1)
    const [chatWindowHeight, setChatWindowHeight] = useState(800)

    const textAreaRef = useRef<HTMLTextAreaElement>(null)
    const sheetContentRef = useRef<HTMLDivElement>(null)
    const scrollAreaTopRef = useRef<HTMLDivElement>(null)
    const scrollAreaBottomRef = useRef<HTMLDivElement>(null)
    const chatWindowRef = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
        refreshChatList()
    }, [])

    useEffect(() => {
        console.log('render []')
        const resizeObserver = new ResizeObserver((entries) => {
            entries.forEach(entry => {
                setChatWindowHeight(entry.contentRect.height)
            });
        })
        if (chatWindowRef.current) {
            resizeObserver.observe(chatWindowRef.current);
        }
        window.electron.ipcRenderer.invoke(GET_CONFIG).then((config: IAppConfig) => {
            setAppConfig({
                ...appConfig,
                ...config
            })
            setUseCustomePrompt(config?.prompt?.useCustomePrompt || false)
            setCustomPrompt(config?.prompt?.custom || '')
        })
        return () => {}
    }, [])

    // 使用虚拟列表之后此处暂时无用了
    // useEffect(() => {
    //     if (textAreaRef.current) {
    //         textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight
    //     }
    // }, [chatContent])

    useEffect(() => {
        console.log('render [messageList]')
        scrollAreaBottomRef.current?.scrollIntoView({behavior: 'auto'})
    }, [messageEntityList])

    const refreshChatList = () => {
        getAllChat().then(res => {
            setChatList([...res, {id: -1, title: '', uuid: '', createTime: 0, updateTime: 0, messages: []}])
        }).catch(err => {
            console.error(err)
        })
    }

    const onPinToggleClick = (): void => {
        setPinState(!pinState)
        window.electron.ipcRenderer.invoke(PIN_WINDOW, !pinState) // pin window
    }

    const onTokenQuestionClick = (url: string): void => {
        console.log('token question click');
        window.electron.ipcRenderer.invoke(OPEN_EXTERNAL, url)
    }

    const onConfigurationsChange = (config: IAppConfig): void => {
        setAppConfig({
            ...appConfig,
            ...config
        })
    }

    const saveConfigurationClick = (): void => {
        window.electron.ipcRenderer.invoke(SAVE_CONFIG, appConfig)
        console.log('configurations to save: ', appConfig)
        toast({
            className: 'buttom-1 right-1 flex',
            variant: 'default',
            // title: 'Save Configuration',
            description: '✅ Save configurations success',
            duration: 1000
            // action: <ToastAction altText="Try again">Try again</ToastAction>
        })
    }

    const onoSheetOpenChange = (val: boolean) => {
        setSheetOpenState(val)
    }

    const beforeFetch = () => {
        setFetchState(true)
    }

    const afterFetch = () => {
        setFetchState(false)
    }

    const generateTitle = async (context) => {
        const titleReq: IChatRequest = {
            url: appConfig.api!,
            content: generateTitlePrompt + context,
            token: appConfig.token!,
            prompt: '',
            model: 'Qwen/Qwen2.5-14B-Instruct'
        }
    
        const reader = await chatRequestWithHook(titleReq, () => {}, () =>{})
        if (!reader) {
          return
        }
        let title = ''
        while (true) {
          const { done, value} = await reader.read()
          if (done) {
            break
          }
          let eventDone = false
          const arr = value.split('\n')
          arr.forEach((data: any) => {
            if (data.length === 0) return; // ignore empty message
            if (data.startsWith(':')) return // ignore sse comment message
            if (data === 'data: [DONE]') {
              eventDone = true
              return
            }
            const json = JSON.parse(data.substring(('data:'.length + 1))) // stream response with a "data:" prefix
            const resultText = json.choices[0].delta.content
            title += resultText || ''
            // console.log(preResult += resultText || '')
          })
          setChatTitle(title)
          if (eventDone) {
            break
          }
        }
        return title
    }

    const onStopBtnClick = () => {
        if (currentReqCtrl) {
            currentReqCtrl.abort()
            setReadStreamState(false)
        }
    }

    const onSubmitClick = async (textCtx: string, mediaCtx: ClipbordImg[] | string[]): Promise<void> => {
        if (!textCtx) {
          return
        }

        let messageBody: ChatMessage
        const modelType = models.filter(md => md.value === selectedModel)[0].type
        if (modelType === 'llm') {
            messageBody = {role: "user", content: textCtx.trim()} as ChatMessage
        } else if (modelType === 'vlm') {
            const imgContents:VLMContent[] = []
            mediaCtx.forEach(imgBase64 => {
                imgContents.push({type: 'image_url', image_url: {url: imgBase64 as string, detail: 'auto'}})
            })
            messageBody = {role: "user", content: [...imgContents, {type: 'text', text: textCtx.trim()}]}
        } else {
            return
        }

        const userMessageEntity: MessageEntity = { body: messageBody }
        const usrMsgId = await saveMessage(userMessageEntity) as number
        console.log(`modelType=${modelType} msgId=${usrMsgId}`, userMessageEntity)

        let currChatId = chatId
        let chatEntity: ChatEntity
        if (!chatUuid && !chatId) {
            const currChatUuid = uuidv4()
            setChatUuid(currChatUuid)
            chatEntity = {uuid: currChatUuid, title: 'NewChat', messages: [usrMsgId], createTime: new Date().getTime(), updateTime: new Date().getTime()}
            const saveChatRetVal = await saveChat(chatEntity)
            currChatId = saveChatRetVal as number
            setChatId(currChatId)
            chatEntity.id = currChatId
        } else {
            chatEntity = await getChatById(currChatId)
            chatEntity.messages = [...chatEntity.messages, usrMsgId]
            chatEntity.updateTime = new Date().getTime()
            updateChat(chatEntity)
        }
        updateChatList(chatEntity)
        
        const messageEntities = [...messageEntityList, userMessageEntity]
        setMessageEntityList(messageEntities)
        // setImageSrcBase64List([])
        
        const req: IChatRequestV2 = {
            url: appConfig.api!,
            messages: messageEntities.map(msg => msg.body),
            token: appConfig.token!,
            prompt: '',
            model: selectedModel
        }

        const controller = new AbortController()
        setCurrReqCtrl(controller)
        const signal = controller.signal

        let gatherResult = ''
        chatRequestWithHookV2(req, signal, beforeFetch, afterFetch)
        .then(async (reader) => {
            if (reader) {
                setReadStreamState(true)
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) {
                        break
                    }
                    let eventDone = false
                    const arr = value.split('\n')
                    arr.forEach((data: any) => {
                    if (data.length === 0) return; // ignore empty message
                    if (data.startsWith(':')) return // ignore sse comment message
                    if (data === 'data: [DONE]') {
                        eventDone = true
                        return
                    }
                    const json = JSON.parse(data.substring(('data:'.length + 1))) // stream response with a "data:" prefix
                    const resultText = json.choices[0].delta.content
                    gatherResult += resultText || ''
                    })
                    setMessageEntityList([...messageEntityList, userMessageEntity, {body: {role: 'system', content: gatherResult}}])
                    if (eventDone) {
                        break
                    }
                }
            }
            setLastMsgStatus(true)
        })
        .catch(err => {
            if (err.name !== 'AbortError') {
                toast({
                    variant: "destructive",
                    title: "Uh oh! Something went wrong.",
                    description: `There was a problem with your request. ${err.message}`
                })
            }
            setLastMsgStatus(false)
        })
        .finally(async () => {
            setReadStreamState(false)
            const sysMessageEntity: MessageEntity = {body: {role: 'system', content: gatherResult}}
            const sysMsgId = await saveMessage(sysMessageEntity) as number
            chatEntity.messages = [...chatEntity.messages, sysMsgId]
            if (!chatTitle || chatTitle === 'NewChat') {
                const title = await generateTitle(textCtx) as string
                chatEntity.title = title
            }
            chatEntity.updateTime = new Date().getTime()
            updateChat(chatEntity)
            updateChatList(chatEntity)
        })
    }

    const updateChatList = (chatEntity: ChatEntity) => {
        setChatList(prev => {
            const nextChatList: ChatEntity[] = []
            prev.forEach(c => {
                if (chatEntity.uuid === c.uuid) {
                    nextChatList.push(chatEntity)
                } else {
                    nextChatList.push(c)
                }
            })
            return nextChatList
        })
    }

    const onSheetHover = () => {
        setSheetOpenState(true)
        refreshChatList()
    }

    const onChatClick = (e, chat: ChatEntity) => {
        setSheetOpenState(false)
        setChatTitle(chat.title)
        setChatUuid(chat.uuid)
        setChatId(chat.id)
        getMessageByIds(chat.messages).then(messageList => {
        setMessageEntityList(messageList)
        }).catch(err => {
            toast({
                variant: "destructive",
                title: "Uh oh! Something went wrong.",
                description: `There was a problem with your databases. ${err.message}`
            })
        })
    }

    const startNewChat = () => {
        setChatId(undefined)
        setChatUuid(undefined)
        setChatTitle('NewChat')
        setMessageEntityList([])
    }

    const onNewChatClick = (e) => {
        setSheetOpenState(false)
        if (chatId && chatUuid) {
            startNewChat()
        }
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
        toast({
            variant: 'default',
            className: 'flex fixed bottom-1 right-1 w-1/3',
            description: '💬 Chat deleted',
            duration: 3000,
            action: (
                <ToastAction onClick={_ => onSheetChatItemDeleteUndo(chat)} className="bg-primary text-primary-foreground hover:bg-primary/90" altText="Undo delete chat">Undo</ToastAction>
            ),
        })
    }

    const onSheetChatItemEditConformClick = (e, chat: ChatEntity) => {
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

    const onChatItemTitleChange = (e, chat: ChatEntity) => {
        chat.title = e.target.value
        updateChat(chat)
        updateChatList(chat)
    }

    const onInputImgMouseOver = (_, imgIndex) => {
        setIptImgHoverIndex(imgIndex)
    }

    const onInputImgMouseLeave = (_) => {
        setIptImgHoverIndex(-1)
    }

    const doRegenerate = (text, mediaCtx: []) => {
        onSubmitClick(text, mediaCtx)
    }

    const [newProviderName, setNewProviderName] = useState()
    const [newProviderApi, setNewProviderApi] = useState()
    const [newProviderApiKey, setNewProviderApiKey] = useState()
    const [newProviderModels, setNewProviderModels] = useState<string[]>([])

    const addProviderClick = () => {
        setSelectProviderPopoutState(false)
    }

    const onNewProviderNameChange = e => {
        setNewProviderName(e.target.value)
    }

    const onNewProviderApiChange = e => {
        setNewProviderApi(e.target.value)
    }

    const onNewProviderApiKeyChange = e => {
        setNewProviderApiKey(e.target.value)
    }

    const onNewProviderModelsChange = e => {
        if(e.target.value) {
            const models = e.target.value.split(',')
            setNewProviderModels(models)
        }
    }

    const onAddProviderBtnClick = e => {
        if(!newProviderName || !newProviderApi || !newProviderApiKey || newProviderModels.length === 0) {
            alert(`Please fill all blanks`)
            e.preventDefault()
            return
        }
        if(providers.find(item => item.name == newProviderName) != undefined) {
            alert(`Provider:${newProviderName} already exists!`)
            e.preventDefault()
            return
        }
        setProviders([...providers, {
            name: newProviderName,
            models: [...newProviderModels],
            apiUrl: newProviderApi,
            apiKey: newProviderApiKey
        }])
        toast({
            variant: 'default',
            duration: 800,
            className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
            description: `✅ ${newProviderName} added`,
        })
        // TODO save provider to local config
    }

    return (
        <div className="div-app app-dragable flex flex-col">
            <div className="header shadow-lg fixed top-0 w-full pb-2 pr-2 pl-2 pt-2 flex items-center justify-between z-10" style={{userSelect: 'none'}}>
                <div className="app-dragable flex-1 space-x-2 flex">
                    <Popover>
                        <PopoverTrigger asChild className="app-undragable">
                            <Button variant="outline" size="icon">
                                <GearIcon />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="m-2 min-w-96 app-undragable">
                            <div className="grid gap-4">
                                <div className="space-y-2 select-none">
                                    <h4 className="font-medium leading-none space-x-2"><span>@i</span><Badge variant="secondary" className='bg-slate-100 text-gray-800'>{appVersion}</Badge></h4>
                                    <p className="text-sm text-muted-foreground">Set the prefernces for @i</p>
                                </div>
                                <div className="grid gap-2">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="provider">Provider</Label>
                                        <div className="app-undragable flex item-center space-x-4">
                                            <Popover open={selectProviderPopoutState} onOpenChange={setSelectProviderPopoutState}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={selectProviderPopoutState}
                                                    className="flex justify-between pl-1 pr-1 space-x-2"
                                                    >
                                                        <span className="flex flex-grow overflow-x-hidden">
                                                        {
                                                            selectedProvider ? 
                                                                (() => {
                                                                    const selected = providers.find(m => m.name === selectedProvider)
                                                                    if (!selected) return null
                                                                    return selected.name
                                                                })()
                                                            : "Select model..."
                                                        }
                                                        </span>
                                                        <ChevronsUpDown className="flex opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-full p-0">
                                                    <Command>
                                                    <CommandInput id="provider" placeholder="Search provider..." className="h-9" />
                                                    <CommandList>
                                                        <CommandEmpty>Oops...NotFound</CommandEmpty>
                                                        <CommandGroup>
                                                        {providers.map((pr) => (
                                                            <CommandItem
                                                            key={pr.name}
                                                            value={pr.name}
                                                            onSelect={(currentValue) => {
                                                                setSelectedProvider(currentValue)
                                                                setSelectProviderPopoutState(false)
                                                            }}
                                                            >
                                                            {pr.name}
                                                            <Check className={cn("ml-auto", selectedProvider === pr.name ? "opacity-100" : "opacity-0")}/>
                                                            </CommandItem>
                                                        ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                            <Drawer>
                                                <DrawerTrigger asChild>
                                                    <Button className="w-full space-x-1" size="sm" variant={"secondary"} onClick={e => {addProviderClick()}}>Add<i className="ri-add-circle-line text-lg"></i></Button>
                                                </DrawerTrigger>
                                                <DrawerContent>
                                                    <DrawerHeader>
                                                        <DrawerTitle>Add provider</DrawerTitle>
                                                        <DrawerDescription>Add custom provider</DrawerDescription>
                                                    </DrawerHeader>
                                                    <DrawerFooter>
                                                        <div className="grid gap-4 app-undragable">
                                                            <div className="grid gap-2">
                                                                <div className="grid grid-cols-3 items-center gap-4">
                                                                    <Label htmlFor="name">Name</Label>
                                                                    <Input
                                                                        id="name"
                                                                        // defaultValue="100%"
                                                                        // value={newProviderName}
                                                                        placeholder="OpenAI"
                                                                        className="col-span-2 h-10"
                                                                        onChange={onNewProviderNameChange}
                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-3 items-center gap-4">
                                                                    <Label htmlFor="apiUrl">API URL</Label>
                                                                    <Input
                                                                        id="apiUrl"
                                                                        // defaultValue="300px"
                                                                        // value={newProviderApi}
                                                                        placeholder="https://api.openai.com/v1/chat/completions"
                                                                        className="col-span-2 h-10"
                                                                        onChange={onNewProviderApiChange}
                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-3 items-center gap-4">
                                                                    <Label htmlFor="apiKey">API Key</Label>
                                                                    <Input
                                                                        id="apiKey"
                                                                        // defaultValue="25px"
                                                                        // value={newProviderApiKey}
                                                                        placeholder="sk-********"
                                                                        className="col-span-2 h-10"
                                                                        onChange={onNewProviderApiKeyChange}

                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-3 items-center gap-4">
                                                                    <Label htmlFor="models">Models</Label>
                                                                    <Textarea
                                                                        id="models"
                                                                        // defaultValue="25px"
                                                                        // value={newProviderModels}
                                                                        placeholder="model1,model2,model3"
                                                                        className="col-span-2 h-8"
                                                                        onChange={onNewProviderModelsChange}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <DrawerTrigger asChild>
                                                            <Button onClick={onAddProviderBtnClick}>Save</Button>
                                                        </DrawerTrigger>
                                                        <DrawerClose asChild>
                                                            <Button variant="outline">Cancel</Button>
                                                        </DrawerClose>
                                                    </DrawerFooter>
                                                </DrawerContent>
                                            </Drawer>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="api">API</Label>
                                        <Input
                                            id="api"
                                            className="col-span-3 h-8 text-sm"
                                            defaultValue={appConfig?.api}
                                            placeholder="server:port/chat/v1/x"
                                            onChange={(event) =>
                                                onConfigurationsChange({ ...appConfig, api: event.target.value })
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="model">
                                            <span>
                                                Model
                                                <Button size={'round'} variant={'ghost'}>
                                                    <TooltipProvider delayDuration={100}>
                                                        <Tooltip>
                                                            {/* asChild fix validateDOMNesting(...): <button> cannot appear as a descendant of <button>. */}
                                                            <TooltipTrigger asChild>
                                                                <QuestionMarkCircledIcon></QuestionMarkCircledIcon>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Get <strong className='underline' onClick={(_) => onTokenQuestionClick('https://docs.siliconflow.cn/docs/model-names')}>SiliconFlow-Models</strong></p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </Button>
                                            </span>
                                        </Label>
                                        <Input
                                            id="model"
                                            className="col-span-3 h-8 text-sm"
                                            defaultValue={appConfig?.model}
                                            onChange={(event) =>
                                                onConfigurationsChange({ ...appConfig, model: event.target.value })
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="token">
                                            <span>
                                                Token
                                                <Button size={'round'} variant={'ghost'}>
                                                    <TooltipProvider delayDuration={100}>
                                                        <Tooltip>
                                                            {/* asChild fix validateDOMNesting(...): <button> cannot appear as a descendant of <button>. */}
                                                            <TooltipTrigger asChild>
                                                                <QuestionMarkCircledIcon></QuestionMarkCircledIcon>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Get <strong className='underline' onClick={(_) => onTokenQuestionClick('https://cloud.siliconflow.cn/account/ak')}>SiliconFlow-Token</strong></p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </Button>
                                            </span>
                                        </Label>
                                        <Input
                                            id="token"
                                            placeholder="Please input your token"
                                            defaultValue={appConfig?.token}
                                            className="col-span-3 h-8 text-sm"
                                            onChange={(event) =>
                                                onConfigurationsChange({ ...appConfig, token: event.target.value })
                                            }
                                        />
                                    </div>
                                    {/* <div className="grid grid-cols-4 items-center gap-4">
                                        <div className='col-span-4 flex items-center space-x-3'>
                                            <Label htmlFor="promptModeSwitcher"><span>Custom Prompt</span></Label>
                                            <Switch id='promptModeSwitcher' defaultChecked={useCustomePrompt} onCheckedChange={onPropmtSwicterChange} />
                                            {
                                                !useCustomePrompt ? <></> :
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button variant='outline' size='sm' className='w-24'>Edit Prompt</Button>
                                                        </DialogTrigger>
                                                        <DialogContent className='[&>button]:hidden rounded-md w-max'>
                                                            <DialogHeader className='space-y-2'>
                                                                <DialogTitle className='select-none'>
                                                                <p className="flex justify-between">
                                                                    <span className="antialiased text-inherit">Edit</span>
                                                                    <DialogClose asChild>
                                                                        <span className="bg-red-500 rounded-full text-white p-0.5"><Cross2Icon className="transition-all duration-300 ease-in-out hover:transform hover:rotate-180"></Cross2Icon></span>
                                                                    </DialogClose>
                                                                </p>
                                                                </DialogTitle>
                                                                <DialogDescription aria-describedby={undefined} />
                                                                <div className='space-y-3'>
                                                                    <Textarea
                                                                        id="promptTextArea"
                                                                        ref={customPromptTextAreaRef}
                                                                        className="h-96 w-full text-base text-slate-600"
                                                                        defaultValue={appConfig.prompt?.custom}
                                                                        placeholder='Input your custom prompt here...'
                                                                    />
                                                                    <DialogFooter className="justify-start flex">
                                                                        <p className='text-xs text-slate-500 select-none pt-2'>Remember to save the prompt. Click blur area to close popout content.</p>
                                                                        <DialogClose asChild>
                                                                            <Button onClick={onCustomPromptSave} size='sm'>
                                                                                Save
                                                                            </Button>
                                                                        </DialogClose>
                                                                    </DialogFooter>
                                                                </div>
                                                            </DialogHeader>
                                                        </DialogContent>
                                                    </Dialog>
                                            }
                                        </div>
                                    </div> */}
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <p className='text-xs text-slate-500 col-span-4 select-none'>After configurations change, remember to save.</p>
                                    </div>
                                </div>
                                <Button size="xs" onClick={saveConfigurationClick}>
                                    Save Configuration
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
                <div className='app-dragable flex-1 flex justify-center'>
                    <Button className='app-undragable h-auto w-auto' variant='secondary'>{chatTitle}</Button>
                </div>
                <div className="app-dragable flex-1 flex justify-end space-x-1">
                    <div className="app-undragable"><ModeToggle></ModeToggle></div>
                    <Button className="app-undragable" size="icon" variant="outline" onClick={onPinToggleClick}>
                        {pinState ? <DrawingPinFilledIcon /> : <DrawingPinIcon />}
                    </Button>
                </div>
            </div>
            <ResizablePanelGroup
                // onLayout={onResizablePanelResize}
                direction="vertical"
                className={cn("div-body w-full rounded-lg border min-h-screen", "pt-[54px]")}
                >
                <ChatProvider>
                    <ResizablePanel defaultSize={80}>
                        <div ref={chatWindowRef} className="app-undragable h-full flex flex-col pl-1 pr-1 gap-4 overflow-y-scroll">
                        <ScrollArea
                            style={{
                                backgroundImage: `url(${bgSvgBlack128})`
                            }} 
                            className="scroll-smooth app-undragable h-full w-full rounded-md border pt-2 bg-auto bg-center bg-no-repeat bg-clip-content relative">
                            <div id="scrollAreaTop" ref={scrollAreaTopRef}></div>
                            <ChatComponent 
                                messages={messageEntityList} 
                                lastMsgStatus={lastMsgStatus} 
                                toast={toast} 
                                reGenerate={doRegenerate}
                                editableContentId={sysEditableContentId}
                                setEditableContentId={setSysEditableContentId}
                                chatWindowHeight={chatWindowHeight}
                                />
                            <Toaster />
                            <ImageGalleryComp
                                    iptImgHoverIndex={iptImgHoverIndex}
                                    onInputImgMouseOver={onInputImgMouseOver}
                                    onInputImgMouseLeave={onInputImgMouseLeave}
                                />
                            {/* {(imageSrcBase64List.length > 0 ? 
                                (
                                    <div className="h-1/6 max-w-full absolute bottom-0 left-1 flex overflow-x-scroll scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200">
                                        {imageSrcBase64List.map((imgItem, index) => (
                                            <div 
                                                key={index} 
                                                className="h-full min-w-[10rem] relative"
                                                onMouseOver={e => onInputImgMouseOver(e, index)}
                                                onMouseLeave={onInputImgMouseLeave}
                                                >
                                                <img className={cn(
                                                    "h-full w-full p-0.5 object-cover backdrop-blur",
                                                    "transition-transform duration-300 ease-in-out",
                                                    "hover:scale-110"
                                                    )} 
                                                    src={imgItem as string} />
                                                {
                                                    iptImgHoverIndex === index && <div onClick={e => onInputImgDelClick(e, index)} className="transition-all duration-300 ease-in-out absolute top-1 right-1"><Cross1Icon className="rounded-full bg-red-500 text-white p-1 w-5 h-5 transition-all duration-300 ease-in-out hover:transform hover:rotate-180" /></div>
                                                }
                                            </div>
                                        ))}
                                    </div>
                                ): <></>
                            )} */}
                            <div id="scrollAreaBottom" ref={scrollAreaBottomRef}></div>
                        </ScrollArea>
                        </div>
                    </ResizablePanel>
                    <ResizableHandle />
                    <div className="app-undragable flex min-h-[2.5vh] pt-0.5 pb-0.5 pl-1">
                        <div className="app-undragable">
                            <Popover open={selectModelPopoutState} onOpenChange={setSelectModelPopoutState}>
                                <PopoverTrigger asChild>
                                    <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={selectModelPopoutState}
                                    className="w-[22vw] max-w-[25vw] justify-between flex pl-1 pr-1"
                                    >
                                        <span className="flex flex-grow overflow-x-hidden">
                                        {
                                            selectedModel ? 
                                                (() => {
                                                    const selected = models.find(m => m.value === selectedModel)
                                                    if (!selected) return null
                                                    return selected.type === 'vlm' ? (
                                                        <span className="flex space-x-2">
                                                            <span>{selected.model}</span>
                                                            <i className="ri-eye-line text-green-500"></i>
                                                        </span>
                                                    ) : (
                                                        selected.model
                                                    );
                                                })()
                                            : "Select model..."
                                        }
                                        </span>
                                        <ChevronsUpDown className="flex opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0">
                                    <Command>
                                    <CommandInput placeholder="Search model..." className="h-9" />
                                    <CommandList>
                                        <CommandEmpty>Oops...NotFound</CommandEmpty>
                                        <CommandGroup>
                                        {models.map((m) => (
                                            <CommandItem
                                            key={m.value}
                                            value={m.value}
                                            onSelect={(currentValue) => {
                                                setSelectedModel(currentValue)
                                                setSelectModelPopoutState(false)
                                            }}
                                            >
                                            {m.model}
                                            {
                                                m.type === 'vlm' && <i className="ri-eye-line text-green-500"></i>
                                            }
                                            <Check className={cn("ml-auto",selectedModel === m.value ? "opacity-100" : "opacity-0")}/>
                                            </CommandItem>
                                        ))}
                                        </CommandGroup>
                                    </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex-grow app-dragable"></div>
                    </div>
                    <ResizablePanel defaultSize={20} minSize={15} maxSize={50}>
                        <InputArea
                            textAreaRef={textAreaRef}
                            readStreamState={readStreamState}
                            onSubmitClick={onSubmitClick}
                            onStopBtnClick={onStopBtnClick}
                            />
                    </ResizablePanel>
                </ChatProvider>
            </ResizablePanelGroup>
            <div className="h-[35vh] fixed left-0 top-1/4 cursor-pointer w-[0.5vh] rounded-full hover:shadow-blue-600/100 hover:shadow-lg" onMouseEnter={onSheetHover} style={{userSelect: 'none'}}></div>
            {/* Sheet Section */}
            <Sheet open={sheetOpenState} onOpenChange={onoSheetOpenChange}>
                    <SheetContent ref={sheetContentRef} side={"left"} className="[&>button]:hidden w-full outline-0 focus:outline-0">
                        <SheetHeader>
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
                                        <CarouselItem onClick={e => {console.log('add new assistant')}}>
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
                                                                <DrawerTitle>Are you absolutely sure?</DrawerTitle>
                                                                <DrawerDescription>This action cannot be undone.</DrawerDescription>
                                                                </DrawerHeader>
                                                                <DrawerFooter>
                                                                <Button>Submit</Button>
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
                                        <Button onClick={onNewChatClick} variant={"default"} className="w-full dark:w-[95%] p-2 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-md">Start a NewChat</Button>
                                    </div>
                                    <div className="flex flex-col p-1 space-y-1 font-sans text-base font-normal overflow-x-scroll">
                                        {
                                            chatList.length > 0 ? chatList.sort((a, b) => a.updateTime > b.updateTime ? -1 : 0).map((item, index) => {
                                                return (
                                                    index === chatList.length - 1 ? 
                                                    <div key={-1} className="flex justify-center text-gray-300 dark:text-gray-700 select-none p-2">No more chats</div> : 
                                                    <div id="chat-item" 
                                                        key={index}
                                                        onMouseOver={(e) => onMouseOverSheetChat(item.id)} 
                                                        onMouseLeave={onMouseLeaveSheetChat}
                                                        onClick={(event) => onChatClick(event, item)} 
                                                        className={
                                                            cn("w-full flex item-center min-h-[4.8vh] pl-2 pr-2 space-x-2 rounded-lg select-none outline-dashed outline-1 outline-gray-100 dark:outline-gray-800", 
                                                                chatList.length !== 1 && item.id === chatId ? "bg-blue-gray-200 dark:bg-blue-gray-700":"hover:bg-blue-gray-200 dark:hover:bg-blue-gray-700",
                                                                index === chatList.length - 1 ? "" : ""
                                                            )}
                                                        >
                                                            <div className="flex items-center w-full flex-[0.8] overflow-x-hidden">
                                                            {
                                                                showChatItemEditConform && chatItemEditId === item.id ? 
                                                                <Input 
                                                                    className="focus-visible:ring-offset-0 focus-visible:ring-0 focus:ring-0 focus:outline-none focus:border-0 border-0" 
                                                                    onClick={e => e.stopPropagation()} 
                                                                    onChange={e => onChatItemTitleChange(e, item)}
                                                                    value={item.title}
                                                                    />
                                                                :
                                                                <div className="flex items-center">
                                                                    <span className="text-ellipsis line-clamp-1 whitespace-no-wrap">{item.title}</span>
                                                                </div>
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
                                                            {/*   
                                                            <div className="flex flex-6 w-full">
                                                            {
                                                                showChatItemEditConform && chatItemEditId === item.id ? 
                                                                <Input 
                                                                    className="focus:ring-0 focus-visible:ring-0" 
                                                                    onClick={e => e.stopPropagation()} 
                                                                    onChange={e => onChatItemTitleChange(e, item)}
                                                                    value={item.title}
                                                                    />
                                                                :
                                                                <span className="line-clamp-1 w-full text-ellipsis whitespace-no-wrap bg-red-300">{item.title}</span>
                                                            }
                                                            </div>
                                                            <div className="flex flex-1 justify-end item-center relative">
                                                                {(sheetChatItemHover && sheetChatItemHoverChatId === item.id ?
                                                                    <div className="flex space-x-2">
                                                                        {
                                                                        showChatItemEditConform && chatItemEditId === item.id ? 
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
                                                                        {item.messages.length}
                                                                    </div>
                                                                )}
                                                            </div> */}

                                                        {/* <div className="flex ml-auto place-items-center justify-self-end relative">
                                                            {
                                                                sheetChatItemHover && sheetChatItemHoverChatId === item.id ?
                                                                <div className="flex space-x-2">
                                                                    {
                                                                        showChatItemEditConform && chatItemEditId === item.id ? 
                                                                        <div className="flex items-center px-1 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-400  hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                            <span onClick={e => onSheetChatItemEditConformClick(e, item)} className="rounded-full px-1 py-1"><CheckIcon /></span>
                                                                        </div>
                                                                        :
                                                                        <div className="flex items-center px-1 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-400  hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                            <span onClick={e => onSheetChatItemEditClick(e, item)} className="rounded-full px-1 py-1"><Pencil2Icon /></span>
                                                                        </div>
                                                                    }
                                                                    <div className="flex items-center px-1 py-1 font-sans text-lg font-bold uppercase rounded-full select-none whitespace-nowrap text-slate-50 bg-red-500 hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                        <span onClick={e => onSheetChatItemDeleteClick(e, item)} className="rounded-full px-1 py-1 text-lg"><Cross2Icon /></span>
                                                                    </div>
                                                                </div>
                                                                :
                                                                <div className="grid items-center px-2 py-1 font-sans text-xs font-bold uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-500">
                                                                    <span>{item.messages.length}</span>
                                                                </div>
                                                            }
                                                        </div> */}
                                                    </div>
                                                )
                                            }) : 
                                            <div className={cn("flex items-center w-full p-3 rounded-md hover:bg-gray-100")} onClick={onNewChatClick}>
                                                NewChat
                                                <div className="grid ml-auto place-items-center justify-self-end">
                                                    <div className="grid items-center px-2 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10">
                                                        <span>0</span>
                                                    </div>
                                                </div>
                                            </div>
                                        }
                                    </div>
                                </div>
                            </div>
                            <div className="sheet-footer absolute bottom-12 w-full">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-medium leading-none">Radix Primitives</h4>
                                    <p className="text-sm text-muted-foreground">
                                    An open-source UI component library.
                                    </p>
                                </div>
                                <Separator className="my-4" />
                                <div className="flex h-5 items-center space-x-4 text-sm">
                                    <div>Blog</div>
                                    <Separator orientation="vertical" />
                                    <div>Docs</div>
                                    <Separator orientation="vertical" />
                                    <div>Source</div>
                                </div>
                            </div>
                        </div>
                    </SheetContent>
            </Sheet>
        </div>
    )
}

function CodeCopyBtn({ children }) {
    const [copyOk, setCopyOk] = React.useState(false);

    const iconColor = copyOk ? '#0af20a' : '#ddd';
    const icon = copyOk ? 'fa-check-square' : 'fa-copy';

    const handleClick = (e) => {
        navigator.clipboard.writeText(children[0].props.children[0]);
        console.log(children)

        setCopyOk(true);
        setTimeout(() => {
            setCopyOk(false);
        }, 500);
    }

    return (
        <div className="code-copy-btn">
            <i className={`fas ${icon}`} onClick={handleClick} style={{color: iconColor}} />
        </div>
    )
}

interface ChatComponentProps {
    messages: MessageEntity[]
    lastMsgStatus: boolean
    reGenerate: Function
    toast: Function
    editableContentId: number
    setEditableContentId: Function
    chatWindowHeight?: number
}

const ChatComponent = (props: ChatComponentProps) => {
    const { messages, lastMsgStatus, reGenerate, toast, editableContentId, setEditableContentId, chatWindowHeight } = props
    const chatListRef = useRef<VListHandle>(null)
    useEffect(() => {
        const debouncedScrollToIndex = debounce(() => {
            chatListRef.current?.scrollToIndex(messages.length, {
                align: 'end',
                smooth: true
            });
        }, 150)
        debouncedScrollToIndex()
        return () => {
            debouncedScrollToIndex.cancel();
        };
    }, [messages])
    // return (
    //     <div className="scroll-smooth w-screen flex flex-col space-y-4 pr-2 pl-2 pb-2">
    //         {
    //             messages.map((message, index) => {
    //                 if (!message.body || !message.body.content || message.body.content.length === 0) {
    //                     return
    //                 }
    //                 return message.body.role == 'user' ? 
    //                     UserChatItem({idx: index, message, msgSize: messages.length, lastMsgStatus, reGenerate, toast})
    //                     : 
    //                     AssiatantChatItem({idx: index, message, toast, editableContentId, setEditableContentId})
    //             })
    //         }
    //     </div>
    // )
    return (
        <VList ref={chatListRef} className="scroll-smooth" style={{ height: chatWindowHeight ? chatWindowHeight - 12 : 900, scrollBehavior: 'smooth' }}>
            {
                messages.map((message, index) => {
                    if (!message.body || !message.body.content || message.body.content.length === 0) {
                        return
                    }
                    return message.body.role == 'user' ? 
                        UserChatItem({idx: index, message, msgSize: messages.length, lastMsgStatus, reGenerate, toast})
                        : 
                        AssiatantChatItem({idx: index, message, toast, editableContentId, setEditableContentId})
                })
            }
        </VList>
    )
}

interface UserChatItemProps {
    idx: number
    message: MessageEntity
    msgSize: number
    lastMsgStatus: boolean
    reGenerate: Function
    toast: Function
}

const UserChatItem = (props: UserChatItemProps) => {
    const {idx, message, msgSize, lastMsgStatus, reGenerate, toast} = props
    const onContextMenuClick = (e) => {}
    const onCopyClick = (copiedContent) => {
        navigator.clipboard.writeText(copiedContent)
        toast({
            duration: 500,
            variant: 'default',
            className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
            description: '✅ Content copied',
        })
    }
    const doRegenerate = (msgBody: ChatMessage) => {
        if (typeof msgBody.content === 'string') {
            reGenerate(msgBody.content, [])
        } else {
            const text = msgBody.content.map((body) => body.text).reduce((prev, curr) => prev ? prev : '' + curr ? curr : '')
            let textCtx = ''
            const imgUrls: string[] = []
            msgBody.content.forEach((bodyItem) => {
                if (bodyItem.text) {
                    textCtx += bodyItem.text
                } else {
                    imgUrls.push(bodyItem.image_url?.url as string)
                }
            })
            reGenerate(text, imgUrls)
        }
    }
    const onImgDoubleClick = (imgUrl) => {
        console.log(imgUrl.substring(0, 50))
    }
    const PreTag = () => {
        return <div className="border-2 border-red-500"><Button className="absolute top-0">Copy</Button></div>
    }
    return (
        <ContextMenu key={idx} modal={true}>
            <ContextMenuTrigger asChild>
            <div className={cn("flex justify-end pr-3")} onContextMenu={onContextMenuClick}>
                {
                    idx === msgSize && !lastMsgStatus && <span className="flex items-end pr-1 text-orange-500 font-bold text-lg"><i onClick={e => reGenerate(message.body.content)} className="ri-refresh-line"></i></span>
                }
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 shadow-lg bg-gray-700 dark:bg-gray-800")}>
                    {typeof message.body.content !== 'string' ? (
                        <>
                            <div className="space-y-1">
                                {message.body.content.map((vlmContent: VLMContent, idx) => {
                                    if (vlmContent.image_url) {
                                        return <img key={idx} src={vlmContent.image_url?.url} onDoubleClick={e => onImgDoubleClick(vlmContent.image_url?.url)}></img>
                                    } else {
                                        return (
                                            <ReactMarkdown 
                                                key={idx} 
                                                className={cn("prose prose-code:text-gray-400 text-md font-medium max-w-[100%] text-slate-200 dark:text-slate-400")}
                                                // components={{
                                                //     code(props) {
                                                //       const {children, className, node, ...rest} = props
                                                //       const match = /language-(\w+)/.exec(className || '')
                                                //       return match ? (
                                                //         <SyntaxHighlighter
                                                //           PreTag={PreTag}
                                                //           children={String(children).replace(/\n$/, '')}
                                                //           language={match[1]}
                                                //           style={dracula}
                                                //           useInlineStyles={false}
                                                //         />
                                                //       ) : (
                                                //         <code {...rest} className={className}>
                                                //           {children}
                                                //         </code>
                                                //       )
                                                //     }
                                                //   }}
                                                >
                                                {vlmContent.text}
                                            </ReactMarkdown>
                                        )
                                    }
                                })}
                            </div>
                        </>
                    ): (
                        <ReactMarkdown 
                            key={idx} 
                            className={cn("prose prose-code:text-gray-400 text-md font-medium max-w-[100%] text-slate-200")}
                            // components={{
                            //     code(props) {
                            //       const {children, className, node, ...rest} = props
                            //       const match = /language-(\w+)/.exec(className || '')
                            //       return match ? (
                            //         <SyntaxHighlighter
                            //           PreTag="div"
                            //           children={String(children).replace(/\n$/, '')}
                            //           language={match[1]}
                            //           style={dracula}
                            //         />
                            //       ) : (
                            //         <code {...rest} className={className}>
                            //           {children}
                            //         </code>
                            //       )
                            //     }
                            //   }}
                            >
                            {message.body.content as string}
                        </ReactMarkdown>
                    )}
                </div>
            </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={_ => onCopyClick(typeof message.body.content === 'string' ? message.body.content : message.body.content.map((body) => body.text).reduce((prev, curr) => prev ? prev : '' + curr ? curr : ''))}>Copy<ContextMenuShortcut><CopyIcon /></ContextMenuShortcut></ContextMenuItem>
                <ContextMenuItem onClick={_ => doRegenerate(message.body)}>Regenerate<ContextMenuShortcut><ReloadIcon /></ContextMenuShortcut></ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

interface AssistantChatItemProps {
    idx: number
    message: MessageEntity
    editableContentId: number
    setEditableContentId: Function
    toast: Function
}

const PreTag = (props) => {
    return <div className="preTag" {...props}></div>
}

const MemoSyntaxHighlighter = React.memo(SyntaxHighlighter)

const SyntaxHighlighterWrapper = React.memo(({ children, language }: { children: string, language: string }) => {
    return (
        <MemoSyntaxHighlighter
            customStyle={{padding: '0', maxHeight: '300px', overflow: 'scroll'}}
            PreTag={PreTag}
            children={String(children).replace(/\n$/, '')}
            language={language}
            style={dracula}
            wrapLongLines={true}
        />
    );
});

const AssiatantChatItem: React.FC<AssistantChatItemProps> = ({ idx, message, toast, editableContentId, setEditableContentId }) => {
    const onCopyClick = (copiedContent) => {
        navigator.clipboard.writeText(copiedContent)
        toast({
            variant: 'default',
            duration: 500,
            className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
            description: '✅ Content copied',
        })
    }
    const onEditContentSave = (e) => {
        const updatedContent = e.target.value
        message.body.content = updatedContent
        updateMessage(message)
    }
    return (
        <ContextMenu key={idx} modal={true}>
            <ContextMenuTrigger asChild>
                <div key={idx} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-400 dark:text-slate-50 overflow-y-scroll">
                        <ReactMarkdown 
                            className="prose prose-code:text-gray-400 text-md font-medium max-w-[100%]"
                            components={{
                                code(props) {
                                  const {children, className, node, ...rest} = props
                                  const match = /language-(\w+)/.exec(className || '')
                                  return match ? (
                                    <SyntaxHighlighterWrapper
                                      children={String(children).replace(/\n$/, '')}
                                      language={match[1]}
                                    />
                                  ) : (
                                    <code {...rest} className={className}>
                                      {children}
                                    </code>
                                  )
                                }
                              }}
                            >
                            {message.body.content as string}
                        </ReactMarkdown>
                        {idx === editableContentId && (
                            <Popover open={idx === editableContentId}>
                                <PopoverTrigger></PopoverTrigger>
                                <PopoverContent className="app-undragable w-[85vw] md:w-[80vw] lg:w-[75vw] h-[30vh] ml-2 p-1 border-0 backdrop-blur-sm bg-black/10 dark:bg-gray/50">
                                    <div className="w-full h-full flex flex-col space-y-2 ">
                                        <p className="pl-1 pr-1 text-inherit flex items-center justify-between">
                                            <span>Edit</span>
                                            <span onClick={e => setEditableContentId(-1)} className="bg-red-500 rounded-full text-white p-0.5"><Cross2Icon className="transition-all duration-300 ease-in-out hover:transform hover:rotate-180"></Cross2Icon></span>
                                        </p>
                                        <Textarea
                                            defaultValue={message.body.content as string}
                                            className="flex-grow h-auto"
                                            onChange={onEditContentSave}
                                        />
                                        <div className="flex space-x-2 justify-end">
                                            <Button variant={'secondary'} size={'sm'} onClick={e => setEditableContentId(-1)} className="bg-red-500 text-slate-50 hover:bg-red-400">Close</Button>
                                            <Button size={'sm'} onClick={e => setEditableContentId(-1)}>Save</Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={_ => onCopyClick(message.body.content)}>Copy<ContextMenuShortcut><CopyIcon /></ContextMenuShortcut></ContextMenuItem>
                <ContextMenuItem onClick={_ => setEditableContentId(idx)}>Edit<ContextMenuShortcut><Pencil2Icon /></ContextMenuShortcut></ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

const AssiatantChatItem1 = (props: AssistantChatItemProps) => {
    const { idx, message, toast, editableContentId, setEditableContentId } = props
    const onCopyClick = (copiedContent) => {
        navigator.clipboard.writeText(copiedContent)
        toast({
            variant: 'default',
            duration: 500,
            className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
            description: '✅ Content copied',
        })
    }
    const onEditClick = (idx, content) => {
        setEditableContentId(idx)
    }
    const onEditContentSave = (e) => {
        const updatedContent = e.target.value
        message.body.content = updatedContent
        // setMessageList((prev: MessageEntity) => {
        //     const nextMessages: MessageEntity[] = []
        //     if (prev.id === message.id) {
        //         nextMessages.push(message)
        //     } else {
        //         nextMessages.push(prev)
        //     }
        // })
        updateMessage(message)
    }
    return (
        <ContextMenu key={idx} modal={true}>
            <ContextMenuTrigger asChild>
                <div key={idx} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-400 dark:text-slate-50 overflow-y-scroll">
                        <ReactMarkdown 
                            className="prose prose-code:text-gray-400 text-md font-medium max-w-[100%]"
                            components={{
                                code(props) {
                                  const {children, className, node, ...rest} = props
                                  const match = /language-(\w+)/.exec(className || '')
                                  return match ? (
                                    <SyntaxHighlighterWrapper
                                      children={String(children).replace(/\n$/, '')}
                                      language={match[1]}
                                    />
                                  ) : (
                                    <code {...rest} className={className}>
                                      {children}
                                    </code>
                                  )
                                }
                              }}
                            >
                            {message.body.content as string}
                        </ReactMarkdown>
                        {idx === editableContentId && (
                            <Popover open={idx === editableContentId}>
                                <PopoverTrigger></PopoverTrigger>
                                <PopoverContent className="app-undragable w-[85vw] md:w-[80vw] lg:w-[75vw] h-[30vh] ml-2 p-1 border-0 backdrop-blur-sm bg-black/10 dark:bg-gray/50">
                                    <div className="w-full h-full flex flex-col space-y-2 ">
                                        <p className="pl-1 pr-1 text-inherit flex items-center justify-between">
                                            <span>Edit</span>
                                            <span onClick={e => setEditableContentId(-1)} className="bg-red-500 rounded-full text-white p-0.5"><Cross2Icon className="transition-all duration-300 ease-in-out hover:transform hover:rotate-180"></Cross2Icon></span>
                                        </p>
                                        <Textarea
                                            defaultValue={message.body.content as string}
                                            className="flex-grow h-auto"
                                            onChange={onEditContentSave}
                                        />
                                        <div className="flex space-x-2 justify-end">
                                            <Button variant={'secondary'} size={'sm'} onClick={e => setEditableContentId(-1)} className="bg-red-500 text-slate-50 hover:bg-red-400">Close</Button>
                                            <Button size={'sm'} onClick={e => setEditableContentId(-1)}>Save</Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={_ => onCopyClick(message.body.content)}>Copy<ContextMenuShortcut><CopyIcon /></ContextMenuShortcut></ContextMenuItem>
                <ContextMenuItem onClick={_ => onEditClick(idx, message.body.content)}>Edit<ContextMenuShortcut><Pencil2Icon /></ContextMenuShortcut></ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}