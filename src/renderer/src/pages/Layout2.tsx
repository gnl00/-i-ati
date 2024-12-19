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
import { PaperPlaneIcon, GearIcon, QuestionMarkCircledIcon, DrawingPinIcon, DrawingPinFilledIcon } from "@radix-ui/react-icons"
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
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renderer/components/ui/table"
import { cn } from "@renderer/lib/utils"
import { useEffect, useRef, useState, forwardRef, useLayoutEffect, useMemo } from "react"
import ReactMarkdown from 'react-markdown'
import { v4 as uuidv4 } from 'uuid';
import { PIN_WINDOW, GET_CONFIG, OPEN_EXTERNAL, SAVE_CONFIG } from '@constants/index'
import { chatRequestWithHook, chatRequestWithHookV2 } from '@request/index'
import { saveMessage, MessageEntity, getMessageById, getMessageByIds } from '../db/MessageRepository'
import { ChatEntity, getChatById, saveChat, updateChat, getAllChat } from '../db/ChatRepository'

const models = [
    {
        provider: "Qwen",
        model: "Qwen2.5-Coder-7B-Instruct"
    },
    {
        provider: "Qwen",
        model: "Qwen2.5-Coder-32B-Instruct"
    },
    {
        provider: "Qwen",
        model: "Qwen2.5-14B-Instruct"
    },
    {
        provider: "Qwen",
        model: "Qwen2.5-32B-Instruct"
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
    const [messageList, setMessageList] = useState<MessageEntity[]>([])
    const [lastMsgStatus, setLastMsgStatus] = useState<boolean>(true)
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
    const [sheetOpenState, setSheetOpenState] = useState(true)
    const [chatContent, setChatContent] = useState<string>()
    const [fetchingState, setFetchingState] = useState<boolean>()

    const sheetContentRef = useRef<HTMLDivElement>(null)
    const customPromptTextAreaRef = useRef<HTMLTextAreaElement>(null)
    const scrollAreaTopRef = useRef<HTMLDivElement>(null)
    const scrollAreaBottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        console.log('render []')
        getAllChat().then(res => {
            setChatList(res)
        }).catch(err => {
            console.error(err)
        })
        
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
        console.log('render [messageList]')
        scrollAreaBottomRef.current?.scrollIntoView({behavior: 'auto'})
    }, [messageList])

    const onPinToggleClick = (): void => {
        setPinState(!pinState)
        // pin window
        window.electron.ipcRenderer.invoke(PIN_WINDOW, !pinState)
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
            className: 'top-0 right-0 flex fixed md:max-w-[360px] md:top-4 md:right-4',
            variant: 'default',
            // title: 'Save Configuration',
            description: '✅ Save configurations success',
            duration: 800
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

    const onSelectModelChange = (val) => {
        setSelectedModel(val)
    }

    const onoSheetOpenChange = (val: boolean) => {
        setSheetOpenState(val)
    }

    const onChatContentChange = (evt) => {
        setChatContent(evt.target.value)
    }

    const beforeFetch = () => {
        setFetchingState(true)
    }

    const afterFetch = () => {
        setFetchingState(false)
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

    const onSubmitClick = async (): Promise<void> => {
        console.log('send message:', chatContent)
        if (!chatContent) {
          return
        }

        const userMessage: MessageEntity = {role: "user", content: chatContent, status: false}
        const usrMsgId = await saveMessage(userMessage) as number

        let currChatId = chatId
        let chatEntity: ChatEntity
        if (!chatUuid && !chatId) {
            const currChatUuid = uuidv4()
            setChatUuid(currChatUuid)
            chatEntity = {uuid: currChatUuid, title: 'NewChat', messages: [usrMsgId]}
            const saveChatRetVal = await saveChat(chatEntity)
            currChatId = saveChatRetVal as number
            setChatId(chatId)
            chatEntity.id = chatId
        } else {
            chatEntity = await getChatById(currChatId)
            chatEntity.messages = [...chatEntity.messages, usrMsgId]
            updateChat(chatEntity)
        }

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
        
        const messages = [...messageList, userMessage]
        setMessageList(messages)
        setChatContent('')

        const req: IChatRequestV2 = {
            url: appConfig.api!,
            messages,
            token: appConfig.token!,
            prompt: '',
            model: selectedModel
        }

        chatRequestWithHookV2(req, beforeFetch, afterFetch)
        .then(async (reader) => {
            if (reader) {
                let gatherResult = ''
                while (true) {
                    const { done, value } = await reader.read()
                    // console.log(done, value)
                    
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
                    // console.log(preResult += resultText || '')
                    })
                    setMessageList([...messageList, userMessage, {role: 'system', content: gatherResult}])
                    if (eventDone) {
                        break
                    }
                }
                // console.log('received message:', gatherResult)
                const sysSuccMessage: MessageEntity = {role: 'system', content: gatherResult, status: true}
                const sysMsgId = await saveMessage(sysSuccMessage) as number
                chatEntity.messages = [...chatEntity.messages, sysMsgId]
                updateChat(chatEntity)
                if (!chatTitle || chatTitle === 'NewChat') {
                    const title = await generateTitle(chatContent) as string
                    // console.log('generateTitle', title)
                    chatEntity.title = title
                    updateChat(chatEntity)
                }

            }
            setLastMsgStatus(true)
        })
        .catch(err => {
            setLastMsgStatus(false)
            toast({
                variant: "destructive",
                title: "Uh oh! Something went wrong.",
                description: `There was a problem with your request. ${err.message}`
            })
        })
    }

    const onSheetHover = () => {
        setSheetOpenState(true)
    }

    const ChatComponent = (props: { list: MessageEntity[] }) => {
        return <div className="scroll-smooth flex flex-col space-y-4 pr-2 pl-2">
            {
                props.list.map((item, index) => {
                    if (item.role.length == 0) {
                        return
                    }
                    return item.role == 'user' ? UserChatItem(index, item) : AssiatantChatItem(index, item)
                })
            }
        </div>
    }
    
    const UserChatItem = (index, message: MessageEntity) => {
        return (
            <div key={index} className={cn("flex justify-end")}>
                {
                    index == (messageList.length - 1) && !lastMsgStatus && <span className="flex items-end pr-1 text-orange-600">Retry</span>
                }
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 shadow-lg bg-gray-900 dark:bg-gray-800")}>
                    <ReactMarkdown className={cn("prose text-md font-medium max-w-[100%] text-slate-300")}>
                        {message.content}
                    </ReactMarkdown>
                </div>
            </div>
        )
    }
    
    const AssiatantChatItem = (key, message: MessageEntity) => {
        return (
            <div key={key} className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-950 dark:text-gray-50 overflow-y-scroll">
                    <ReactMarkdown className="prose text-md font-medium max-w-[100%]">
                        {message.content}
                    </ReactMarkdown>
                </div>
            </div>
        )
    }

    interface CusTextareaProps {
        className?: string
        style?: React.CSSProperties
        [key: string]: any
    }

    const CusTextArea = forwardRef<HTMLDivElement, CusTextareaProps>(
        ({ className, style, ...props }, ref) => {
          return (
            <div
              className={cn(
                'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                className
              )}
              ref={ref}
              {...props}
            />
          )
        }
      )

    const onTextAreaKeyDown = (e) => {
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault() // 防止跳到新的一行
            console.log('Shift + Enter pressed!')
            return
        }
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault() // 防止跳到新的一行
            console.log('Shift + Enter pressed!')
            return
        }
        if (e.key === 'Enter') {
            onSubmitClick()
        }
    }

    const onTextAreaPaste = (e) => {
        console.log('onPaste', e)
        // const text = e.clipboardData.getData('text/plain')
        // console.log('text', text)
        const items = e.clipboardData.items
        console.log(items);
    }

    const onChatClick = (e, chat: ChatEntity) => {
        // console.log(chat)
        setSheetOpenState(false)
        setChatTitle(chat.title)
        setChatUuid(chat.uuid)
        setChatId(chat.id)
        getMessageByIds(chat.messages).then(messageList => {
            setMessageList(messageList)
        }).catch(err => {
            toast({
                variant: "destructive",
                title: "Uh oh! Something went wrong.",
                description: `There was a problem with your databases. ${err.message}`
            })
        })
    }

    return (
        <div className="div-app app-dragable flex flex-col">
            <div className="header shadow-lg fixed top-0 w-full pb-2 pr-2 pl-2 pt-2 flex items-center justify-between z-10" style={{userSelect: 'none'}}>
                <div className="app-dragable flex-1 space-x-2 flex">
                    {/* <SheetTrigger asChild className="app-undragable"><Button variant='outline' size={'xs'}><ActivityLogIcon></ActivityLogIcon></Button></SheetTrigger> */}
                    <Popover>
                        <PopoverTrigger className="app-undragable">
                            <div className="h-8 rounded-md px-3 border hover:bg-accent hover:text-accent-foreground flex items-center">
                                <GearIcon />
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="m-2 min-w-96 app-undragable">
                            <div className="grid gap-4">
                                <div className="space-y-2 select-none">
                                    <h4 className="font-medium leading-none space-x-2"><span>@i</span><Badge variant="secondary" className='bg-slate-100'>{appVersion}</Badge></h4>
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
                                                                <DialogTitle className='select-none'>Custom prompt</DialogTitle>
                                                                <DialogDescription aria-describedby={undefined} />
                                                                <div className='space-y-3'>
                                                                    <Textarea
                                                                        id="promptTextArea"
                                                                        ref={customPromptTextAreaRef}
                                                                        className="h-96 w-full text-base text-slate-600"
                                                                        defaultValue={appConfig.prompt?.custom}
                                                                        placeholder='Input your custom prompt here...
                                                                        &#10;We offer 2 variables&#10;- {{sourceLang}}&#10;- {{targetLang}}&#10;as placeholders.
                                                                        &#10;Example&#10;请以简洁，幽默的语气将{{sourceLang}}准确的翻译成{{targetLang}}并按照...格式输出。'
                                                                    />
                                                                    <DialogFooter className="justify-start flex">
                                                                        <p className='text-xs text-slate-500 select-none pt-2'>Remember to save the prompt. Click blur area to close popout content.</p>
                                                                        <DialogClose asChild>
                                                                            <Button onClick={onCustomPromptSave} size='sm'>
                                                                                Save prompt
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
                <div className="app-dragable flex-1 flex justify-end">
                    <Toggle className="app-undragable" size="xs" variant="outline" onClick={onPinToggleClick}>
                        {pinState ? <DrawingPinFilledIcon /> : <DrawingPinIcon />}
                    </Toggle>
                </div>
            </div>
            <ResizablePanelGroup
                direction="vertical"
                className={cn("div-body w-full rounded-lg border min-h-screen", "pt-[54px]")}
                >
                <ResizablePanel defaultSize={80}>
                    <div className="app-undragable h-full flex flex-col pl-1 pr-1 gap-4 overflow-y-scroll">
                    <ScrollArea className="scroll-smooth app-undragable h-full w-full rounded-md border pt-2 pb-2">
                        <div id="scrollAreaTop" ref={scrollAreaTopRef}></div>
                        <ChatComponent list={messageList}/>
                        <Toaster />
                        <div id="scrollAreaBottom" ref={scrollAreaBottomRef}></div>
                    </ScrollArea>
                    </div>
                </ResizablePanel>
                <ResizableHandle />
                <div className="app-undragable flex min-h-[2.5vh] pt-0.5 pb-0.5 pl-1">
                    <div className="app-undragable">
                        {/* use Combobox instead */}
                        <Select onValueChange={onSelectModelChange} defaultValue={selectedModel}>
                            <SelectTrigger className="w-auto h-auto">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {
                                    models.map((item, _) => {
                                        return <SelectItem key={item.provider.concat('/').concat(item.model)} value={item.provider.concat('/').concat(item.model)}>{item.model}</SelectItem>
                                    })
                                }
                        </SelectContent>
                    </Select>
                    </div>
                    <div className="flex-grow app-dragable"></div>
                </div>
                <ResizablePanel defaultSize={20} minSize={15} maxSize={50}>
                    <div className="flex h-full app-undragable ">
                        <Textarea onKeyDown={onTextAreaKeyDown} value={chatContent} onPaste={onTextAreaPaste} onChange={onChatContentChange} className="w-full text-md" placeholder="Anything you want yo ask..."></Textarea>
                        {/* <CusTextArea contentEditable className={'app-undragable p-0.5 m-0 bg-red-100'}></CusTextArea> */}
                    </div>
                    <Button className='fixed bottom-0 right-0 mr-2 mb-1.5 flex items-center' type="submit" onClick={onSubmitClick}>Enter&ensp;<PaperPlaneIcon className="-rotate-45 mb-1.5" /></Button>
                </ResizablePanel>
            </ResizablePanelGroup>
            <div className="h-[30vh] fixed left-0 top-1/3 cursor-pointer w-[1vh] hover:shadow-blue-600/100 hover:shadow-lg" onMouseEnter={onSheetHover} style={{userSelect: 'none'}}></div>
            {/* Sheet Section */}
            <Sheet open={sheetOpenState} onOpenChange={onoSheetOpenChange}>
                    <SheetContent ref={sheetContentRef} side={"left"} className="[&>button]:hidden w-full">
                        <SheetHeader>
                            <SheetTitle>@i</SheetTitle>
                            <SheetDescription>
                                -- Just an AI API client.
                            </SheetDescription>
                        </SheetHeader>
                        <div className="w-full h-full p-0 m-0 relative">
                            <div className="pl-8 pr-8 pt-8">
                                <Carousel className="w-full max-w-xs">
                                    <CarouselContent>
                                        {Array.from({ length: 5 }).map((_, index) => (
                                        <CarouselItem key={index}>
                                            <div className="p-1">
                                            <Card>
                                                <CardContent className="flex aspect-square items-center justify-center p-6 select-none">
                                                    <span className="text-4xl font-semibold">NewChat-{index + 1}</span>
                                                </CardContent>
                                            </Card>
                                            </div>
                                        </CarouselItem>
                                        ))}
                                    </CarouselContent>
                                    <CarouselPrevious />
                                    <CarouselNext />
                                </Carousel>
                            </div>
                            <div className="sheet-content h-full w-full pt-10">
                                <div className="flex flex-col text-gray-700 w-full rounded-md shadow-lg bg-white">
                                    <div className="flex flex-col p-2 gap-1 font-sans text-base font-normal text-blue-gray-700">
                                        {
                                            chatList.map((item, index) => {
                                                return (
                                                <div key={index} onClick={(event) => onChatClick(event, item)} className={cn("flex items-center w-full p-3 rounded-md hover:bg-gray-200", (index + 1) === chatId ? "bg-gray-200":"")}>
                                                    {item.title}
                                                    <div className="grid ml-auto place-items-center justify-self-end">
                                                        <div className="grid items-center px-2 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10">
                                                            <span className="">{item.messages.length}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                )
                                            })
                                        }
                                        <div className="flex items-center w-full p-3 rounded-md hover:bg-gray-200">
                                            A NewChat
                                            <div className="grid ml-auto place-items-center justify-self-end">
                                                <div className="grid items-center px-2 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10">
                                                    <span className="">14</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center w-full p-3 rounded-md hover:bg-gray-300">
                                            Another NewChat
                                            <div className="grid ml-auto place-items-center justify-self-end">
                                                <div className="grid items-center px-2 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10">
                                                    <span className="">342</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center w-full p-3 rounded-md hover:bg-gray-300">
                                            Oldest NewChat
                                            <div className="grid ml-auto place-items-center justify-self-end">
                                                <div className="grid items-center px-2 py-1 font-sans text-xs font-bold text-gray-900 uppercase rounded-full select-none whitespace-nowrap bg-gray-900/10">
                                                    <span className="">768</span>
                                                </div>
                                            </div>
                                        </div>
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