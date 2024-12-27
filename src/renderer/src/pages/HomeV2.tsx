import {
    Button
} from "@renderer/components/ui/button"
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
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@renderer/lib/utils"
import React from 'react'
import { useEffect, useRef, useState, forwardRef, useLayoutEffect, useMemo } from "react"
import ReactMarkdown from 'react-markdown'
import { v4 as uuidv4 } from 'uuid';
import { PIN_WINDOW, GET_CONFIG, OPEN_EXTERNAL, SAVE_CONFIG } from '@constants/index'
import { chatRequestWithHook, chatRequestWithHookV2 } from '@request/index'
import { saveMessage, getMessageByIds, updateMessage } from '../db/MessageRepository'
import { getChatById, saveChat, updateChat, getAllChat, deleteChat } from '../db/ChatRepository'
import bgSvgBlack128 from '../assets/black-icon-128x128.svg'
import { ModeToggle } from "@renderer/components/mode-toggle"
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {atomDark, darcula, dracula, duotoneDark, duotoneEarth, funky, ghcolors, oneDark} from 'react-syntax-highlighter/dist/esm/styles/prism'

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

const generateTitlePrompt = "Generate a briefly and precisely title from the context below. NOTE: RETURN ME THE TITLE ONLY"

export default () => {
    // @ts-ignore
    const appVersion = __APP_VERSION__

    const { toast } = useToast()

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
    const [selectedModel, setSelectedModel] = useState('Qwen/Qwen2.5-Coder-32B-Instruct')
    const [selectModelPopoutState, setSelectModelPopoutState] = useState(false)
    const [sheetOpenState, setSheetOpenState] = useState<boolean>(false)
    const [chatContent, setChatContent] = useState<string>()
    const [fetchState, setFetchState] = useState<boolean>()
    const [currentReqCtrl, setCurrReqCtrl] = useState<AbortController>()
    const [readStreamState, setReadStreamState] = useState<boolean>(false)
    const [compositionState, setCompositionState] = useState<boolean>(false) // inputMethod state
    const [chatItemEditId, setChatItemEditId] = useState<number | undefined>()
    const [showChatItemEditConform, setShowChatItemEditConform] = useState<boolean | undefined>(false)
    const [sheetChatItemHover, setSheetChatItemHover] = useState(false)
    const [sheetChatItemHoverChatId, setSheetChatItemHoverChatId] = useState<number>()
    const [iptImgHoverIndex, setIptImgHoverIndex] = useState(-1)
    const [imageSrcBase64List, setImageSrcBase64List] = useState<ClipbordImg[]>([]);
    const [sysEditableContentId, setSysEditableContentId] = useState(-1)

    const textAreaRef = useRef<HTMLTextAreaElement>(null)
    const sheetContentRef = useRef<HTMLDivElement>(null)
    const customPromptTextAreaRef = useRef<HTMLTextAreaElement>(null)
    const scrollAreaTopRef = useRef<HTMLDivElement>(null)
    const scrollAreaBottomRef = useRef<HTMLDivElement>(null)

    useLayoutEffect(() => {
        refreshChatList()
    }, [])

    useEffect(() => {
        console.log('render []')
        
        const resizeObserver = new ResizeObserver((entries) => {
            console.log('re-size')
        })

        setTimeout(() => {
            // if (virtualDivRef.current) {
            //     const heights: number[] = []
            //     virtualDivRef.current.style.display = ''
            //     const childElements = virtualDivRef.current.children;
            //     // 遍历子元素并记录高度
            //     for (let i = 0; i < childElements.length; i++) {
            //         heights.push(childElements[i].clientHeight)
            //     }
            //     setVirHeightList([...heights])
            //     // 输出子元素的高度
            //     console.log('useEffect 子元素的高度:', heights)
            //     virtualDivRef.current.style.display = 'none'
            // }
        }, 0)

        window.electron.ipcRenderer.invoke(GET_CONFIG).then((config: IAppConfig) => {
            setAppConfig({
                ...appConfig,
                ...config
            })
            setUseCustomePrompt(config?.prompt?.useCustomePrompt || false)
            setCustomPrompt(config?.prompt?.custom || '')
        })

        const handleMouseMove = (event) => {
            // 检查鼠标是否靠近左边框，例如距离左边框 10 像素以内
            const threshold = 15
            const windowHeight = window.innerHeight
            const offset = windowHeight / 3
            if (event.clientX <= threshold && (event.clientY >= offset && event.clientY <= windowHeight - offset)) {
                setSheetOpenState(true)
            } else {
                if (sheetContentRef.current) {
                    const sheetRect = sheetContentRef.current.getBoundingClientRect();
                    const sheetRightEdge = sheetRect.right;
            
                    if (event.clientX >= sheetRightEdge) {
                        setSheetOpenState(false);
                    }
                }
            }
        }
        // addEventListener('mousemove', handleMouseMove)
        return () => {
            // removeEventListener('mousemove', handleMouseMove)
        }
    }, [])

    useEffect(() => {
        if (textAreaRef.current) {
            textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight
        }
    }, [chatContent]);

    useEffect(() => {
        // console.log('render [messageList]')
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

    const onPropmtSwicterChange = (value: boolean) => {
        setUseCustomePrompt(value)
        onConfigurationsChange({ ...appConfig, prompt: { ...appConfig.prompt, useCustomePrompt: value } })
    }

    const onCustomPromptSave = () => {
        if (customPromptTextAreaRef && customPromptTextAreaRef.current != null) {
            const value = customPromptTextAreaRef.current.value
            setCustomPrompt(value)
            onConfigurationsChange({ ...appConfig, prompt: { ...appConfig.prompt, custom: value } })
        }
    }

    const onoSheetOpenChange = (val: boolean) => {
        setSheetOpenState(val)
    }

    const onChatContentChange = (evt) => {
        setChatContent(evt.target.value)
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
        // console.log('send content', content)
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
        setChatContent('')
        setImageSrcBase64List([])
        
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

    const onTextAreaKeyDown = (e) => {
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault() // 防止跳到新的一行
            // console.log('Shift + Enter pressed!')
            const inputElement = e.target
            const start = inputElement.selectionStart
            const end = inputElement.selectionEnd
            // 获取当前输入框的内容
            let value = inputElement.value
            // 在光标位置插入换行符
            value = value.substring(0, start) + "\n" + value.substring(end)
            // 更新
            inputElement.value = value
            setChatContent(value)
            // 将光标移动到换行符之后
            inputElement.selectionStart = start + 1
            inputElement.selectionEnd = start + 1
            return
        }
        if (e.key === 'Enter' && !compositionState) {
            e.preventDefault()
            onSubmitClick(chatContent as string, imageSrcBase64List)
        }
    }

    const onTextAreaPaste = (event) => {
        // console.log('onPaste', event)
        // const text = e.clipboardData.getData('text/plain')
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        let blob = null

        let findImg: boolean = false
        // 遍历粘贴的数据项
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                // 找到图片类型的数据
                blob = items[i].getAsFile()
                findImg = true
                break
            }
        }
        console.log(`findImg? ${findImg}`)
        if (blob) {
            // 创建 FileReader 对象
            const reader = new FileReader()
            // 以 Data URL 的形式读取文件内容
            reader.readAsDataURL(blob)
            // 当文件读取完成后触发
            reader.onloadend = () => {
                // 设置图片的 src 属性为读取到的数据 URL
                // console.log(reader.result) // base64 格式的图片数据
                setImageSrcBase64List([...imageSrcBase64List, reader.result])
            }
        }
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

    const onCompositionStart = e => {
        setCompositionState(true)
    }

    const onCompositionEnd = e => {
        setCompositionState(false)
    }

    const onMouseOverSheetChat = (chatId) => {
        setSheetChatItemHover(true)
        setSheetChatItemHoverChatId(chatId)
    }

    const onMouseLeaveSheetChat = () => {
        setSheetChatItemHover(false)
        setSheetChatItemHoverChatId(-1)
    }

    const onSheetChatItemDeleteUndo = (chat: ChatEntity, timeoutId) => {
        // chatList still contains the deleted chat so we just need to update it manually
        setChatList([...chatList])
        updateChat(chat)
        // clearTimeout(timeoutId)
    }

    const onSheetChatItemDeleteClick = (e, chat: ChatEntity) => {
        e.stopPropagation()
        // console.log('delete-from-list', chat)
        setChatList(chatList.filter(item => item.id !== chat.id))
        deleteChat(chat.id)
        // const timeoutId = setTimeout(() => {
        //     deleteChat(chat.id)
        // }, 3500)
        if (chat.id === chatId) {
            startNewChat()
        }
        toast({
            variant: 'default',
            className: 'flex fixed bottom-1 right-1 w-1/3',
            description: '💬 Chat deleted',
            duration: 3000,
            action: (
                <ToastAction onClick={_ => onSheetChatItemDeleteUndo(chat, -1)} className="bg-primary text-primary-foreground hover:bg-primary/90" altText="Undo delete chat">Undo</ToastAction>
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

    const onInputImgDelClick = (_, delIndex) => {
        setImageSrcBase64List(imageSrcBase64List.filter((_, index) => index != delIndex))
    }

    const doRegenerate = (text, mediaCtx: []) => {
        onSubmitClick(text, mediaCtx)
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
                                    <div className="grid grid-cols-4 items-center gap-4">
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
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <p className='text-xs text-slate-500 col-span-4 select-none'>Everytime you change the configurations, you need to save it.</p>
                                    </div>
                                </div>
                                <Button size="xs" onClick={saveConfigurationClick}>
                                    Save Configurations
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
                direction="vertical"
                className={cn("div-body w-full rounded-lg border min-h-screen", "pt-[54px]")}
                >
                <ResizablePanel defaultSize={80}>
                    <div className="app-undragable h-full flex flex-col pl-1 pr-1 gap-4 overflow-y-scroll">
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
                            setMessageList={setMessageEntityList}
                            />
                        <Toaster />
                        {(imageSrcBase64List.length > 0 ? 
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
                        )}
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
                    <div className="flex h-full app-undragable ">
                        <Textarea 
                            className="w-full text-md pb-2"
                            value={chatContent}
                            ref={textAreaRef}
                            placeholder="Anything you want yo ask..."
                            onKeyDown={onTextAreaKeyDown} 
                            onPaste={onTextAreaPaste} 
                            onChange={onChatContentChange}
                            onCompositionStart={onCompositionStart}
                            onCompositionEnd={onCompositionEnd}
                            />
                    </div>
                    {(!readStreamState ?
                        <Button 
                            className={cn("fixed bottom-0 right-0 mr-2 mb-1.5 flex items-center transition-transform duration-500 hover:scale-120 hover:-translate-y-1 hover:-translate-x-1", 
                                readStreamState ? "-translate-x-full opacity-0" : ""
                            )} 
                            type="submit" 
                            onClick={e => onSubmitClick(chatContent as string, imageSrcBase64List)}
                            >
                            Enter&ensp;<PaperPlaneIcon className="-rotate-45 mb-1.5" />
                        </Button>
                        :
                        <Button 
                            className={cn("fixed bottom-0 right-0 mr-2 mb-1.5 flex items-center animate-bounce transition-transform duration-700 hover:scale-120 hover:-translate-y-1 hover:-translate-x-1", 
                                readStreamState ? "" : "-translate-x-full opacity-0"
                            )} 
                            variant="destructive" 
                            type="submit" 
                            onClick={onStopBtnClick}
                            >
                            Stop&ensp;<StopIcon />
                        </Button>
                    )}
                </ResizablePanel>
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
                                        {
                                            Array.from({ length: 5 }).map((_, index) => (
                                                <CarouselItem key={index}>
                                                    <div className="p-1">
                                                        {/* TODO - Pinned assistant */}
                                                        <Card>
                                                            <CardContent className="flex aspect-square items-center justify-center p-6 select-none">
                                                                <span className="text-4xl font-semibold">Assiatant-{index + 1}</span>
                                                            </CardContent>
                                                        </Card>
                                                    </div>
                                                </CarouselItem>
                                            ))
                                        }
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
                                    <div className="flex flex-col p-2 space-y-1 w-full font-sans text-base font-normal overflow-x-scroll">
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
                                                            cn("flex items-center justify-center w-auto text-ellipsis p-2 rounded-lg select-none outline-dashed outline-1 outline-gray-100 dark:outline-gray-800", 
                                                                chatList.length !== 1 && item.id === chatId ? "bg-blue-gray-200 dark:bg-blue-gray-700":"hover:bg-blue-gray-200 dark:hover:bg-blue-gray-700",
                                                                index === chatList.length - 1 ? "" : ""
                                                            )}
                                                        >
                                                            {
                                                                showChatItemEditConform && chatItemEditId === item.id ? 
                                                                <Input 
                                                                    className="focus:ring-0 focus-visible:ring-0 w-[70%]" 
                                                                    onClick={e => e.stopPropagation()} 
                                                                    onChange={e => onChatItemTitleChange(e, item)}
                                                                    value={item.title}
                                                                    />
                                                                :
                                                                <span className="w-[80%] line-clamp-1 text-ellipsis whitespace-no-wrap">{item.title}</span>
                                                            }
                                                        <div className="flex ml-auto place-items-center justify-self-end relative">
                                                            {
                                                                sheetChatItemHover && sheetChatItemHoverChatId === item.id ?
                                                                <div className="flex space-x-2">
                                                                    {
                                                                        showChatItemEditConform && chatItemEditId === item.id ? 
                                                                        <div className="flex items-center px-1 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-400  hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                            <span onClick={e => onSheetChatItemEditConformClick(e, item)} className="rounded-full px-2 py-2"><CheckIcon /></span>
                                                                        </div>
                                                                        :
                                                                        <div className="flex items-center px-1 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-400  hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                            <span onClick={e => onSheetChatItemEditClick(e, item)} className="rounded-full px-2 py-2"><Pencil2Icon /></span>
                                                                        </div>
                                                                    }
                                                                    <div className="flex items-center px-1 py-1 font-sans text-lg font-bold uppercase rounded-full select-none whitespace-nowrap text-slate-50 bg-red-500 hover:scale-125 transition-transform duration-300 ease-in-out">
                                                                        <span onClick={e => onSheetChatItemDeleteClick(e, item)} className="rounded-full px-2 py-2 text-lg"><Cross2Icon /></span>
                                                                    </div>
                                                                </div>
                                                                :
                                                                <div className="grid items-center px-2 py-1 font-sans text-xs font-bold uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10 dark:bg-gray-500">
                                                                    <span>{item.messages.length}</span>
                                                                </div>
                                                            }
                                                        </div>
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
    setMessageList: Function
}

const ChatComponent = (props: ChatComponentProps) => {
    const { messages, lastMsgStatus, reGenerate, toast, editableContentId, setEditableContentId, setMessageList } = props 
    return <div className="scroll-smooth w-screen flex flex-col space-y-4 pr-2 pl-2 pb-2">
        {
            messages.map((message, index) => {
                if (!message.body || !message.body.content || message.body.content.length === 0) {
                    return
                }
                return message.body.role == 'user' ? UserChatItem({key: index, message, msgSize: messages.length, lastMsgStatus, reGenerate, toast}) : AssiatantChatItem({key: index, message, toast, editableContentId, setEditableContentId, setMessageList})
            })
        }
    </div>
}

interface UserChatItemProps {
    key: number
    message: MessageEntity
    msgSize: number
    lastMsgStatus: boolean
    reGenerate: Function
    toast: Function
}

const UserChatItem = (props: UserChatItemProps) => {
    const {key, message, msgSize, lastMsgStatus, reGenerate, toast} = props
    // const [popoverState, setPopoverState] = useState(false)
    // const { toast } = useToast()
    const onContextMenuClick = (e) => {
        // e.preventDefault()
        // setPopoverState(!popoverState)
    }
    const onCopyClick = (copiedContent) => {
        navigator.clipboard.writeText(copiedContent)
        toast({
            // title: 'Copied',
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
        <ContextMenu key={key} modal={true}>
            <ContextMenuTrigger asChild>
            <div className={cn("flex justify-end pr-3")} onContextMenu={onContextMenuClick}>
                {
                    key === msgSize && !lastMsgStatus && <span className="flex items-end pr-1 text-orange-500 font-bold text-lg"><i onClick={e => reGenerate(message.body.content)} className="ri-refresh-line"></i></span>
                }
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 shadow-lg bg-gray-900 dark:bg-gray-700")}>
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
                                                className={cn("prose text-md font-medium max-w-[100%] text-slate-200")}
                                                components={{
                                                    code(props) {
                                                      const {children, className, node, ...rest} = props
                                                      const match = /language-(\w+)/.exec(className || '')
                                                      return match ? (
                                                        <SyntaxHighlighter
                                                          PreTag={PreTag}
                                                          children={String(children).replace(/\n$/, '')}
                                                          language={match[1]}
                                                          style={dracula}
                                                        />
                                                      ) : (
                                                        <code {...rest} className={className}>
                                                          {children}
                                                        </code>
                                                      )
                                                    }
                                                  }}
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
                            key={key} 
                            className={cn("prose text-md font-medium max-w-[100%] text-slate-200")}
                            components={{
                                code(props) {
                                  const {children, className, node, ...rest} = props
                                  const match = /language-(\w+)/.exec(className || '')
                                  return match ? (
                                    <SyntaxHighlighter
                                      PreTag="div"
                                      children={String(children).replace(/\n$/, '')}
                                      language={match[1]}
                                      style={dracula}
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
    key: number
    message: MessageEntity
    toast: Function
    editableContentId: number
    setEditableContentId: Function
    setMessageList: Function
}

const AssiatantChatItem = (props: AssistantChatItemProps) => {
    const { key, message, toast, editableContentId, setEditableContentId, setMessageList } = props

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
        <ContextMenu key={key} modal={true}>
            <ContextMenuTrigger asChild>
                <div key={key} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-400 dark:text-slate-50 overflow-y-scroll">
                        <ReactMarkdown 
                            className="prose text-md font-medium max-w-[100%]"
                            components={{
                                code(props) {
                                  const {children, className, node, ...rest} = props
                                  const match = /language-(\w+)/.exec(className || '')
                                  return match ? (
                                    <SyntaxHighlighter
                                      PreTag="div"
                                      children={String(children).replace(/\n$/, '')}
                                      language={match[1]}
                                      style={dracula}
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
                        {key === editableContentId && (
                            <Popover open={key === editableContentId}>
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
                <ContextMenuItem onClick={_ => onEditClick(key, message.body.content)}>Edit<ContextMenuShortcut><Pencil2Icon /></ContextMenuShortcut></ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}