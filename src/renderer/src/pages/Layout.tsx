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
import { PaperPlaneIcon, GearIcon, QuestionMarkCircledIcon, DrawingPinIcon, DrawingPinFilledIcon, ActivityLogIcon } from "@radix-ui/react-icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import List from "rc-virtual-list"
import ReactMarkdown from 'react-markdown'
import { PIN_WINDOW, GET_CONFIG, OPEN_EXTERNAL, SAVE_CONFIG } from '@constants/index'
import { cn } from "@renderer/lib/utils"
import { useEffect, useRef, useState, forwardRef, ReactHTMLElement, ReactElement } from "react"
import { ScrollArea } from "@renderer/components/ui/scroll-area"
import { debounce } from 'lodash';

const ChatComponent = (props: { list: { role: string, content: string }[] }) => {
  return <div className="smooth-scroll flex flex-col gap-4 pr-2 pl-2 pt-2">
    {
      props.list.map((item, index) => {
        if (item.role.length == 0) {
          return
        }
        return item.role == 'user' ? UserChatItem(index, item.content) : AssiatantChatItem(index, item.content)
      })
    }
  </div>
}

const UserChatItem = (key, content) => {
  return <div className="app-undragble flex justify-end" key={key}>
    <div className="max-w-[80%] rounded-2xl bg-gray-900 px-4 py-3 shadow-lg dark:bg-gray-800">
      <div className="text-sm font-medium">
        <ReactMarkdown className="prose text-slate-300">
          {content}
        </ReactMarkdown>
      </div>
    </div>
  </div>
}

const AssiatantChatItem = (key, content) => {
  return <div className="app-undragble flex justify-start" key={key}>
    <div className="max-w-[80%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-950 dark:text-gray-50 overflow-y-scroll">
      <div className="text-sm font-medium">
        <ReactMarkdown className="prose">
          {content}
        </ReactMarkdown>
      </div>
    </div>
  </div>
}

const heights: number[] = [];

interface Item {
  id: number;
  height: number;
  content: ReactElement
}

const MyItem: React.ForwardRefRenderFunction<HTMLDivElement, Item> = ({ id, height, content }, ref) => {

  return (
    <div
      ref={ref}
      style={{
        border: '1px solid gray',
        height,
        lineHeight: '30px',
        boxSizing: 'border-box',
        display: 'inline-block',
      }}
    >
      {content}
    </div>
  );
};

const ForwardMyItem = forwardRef(MyItem);

const chats = [
  "react-window 是一个用于优化大规模列表渲染性能的库。在处理聊天记录列表时，计算每条聊天记录的高度可能并不总是那么简单，因为高度取决于很多因素，例如字体大小、行高、是否包含图片或链接等。",
  `
  动态调整高度：如果聊天记录的高度是动态变化的（例如包含图片或链接），你可能需要在每次消息内容更新时重新计算高度。这可以通过监听 message 的变化并重新渲染组件来实现。
  注意：这种方法可能不适用于所有情况，特别是当聊天记录的高度依赖于复杂布局或动态内容时。在这种情况下，你可能需要考虑使用更复杂的布局管理库（如 styled-components 或 emotion）来更好地控制元素的尺寸和位置。

  动态调整高度：如果聊天记录的高度是动态变化的（例如包含图片或链接），你可能需要在每次消息内容更新时重新计算高度。这可以通过监听 message 的变化并重新渲染组件来实现。
  注意：这种方法可能不适用于所有情况，特别是当聊天记录的高度依赖于复杂布局或动态内容时。在这种情况下，你可能需要考虑使用更复杂的布局管理库（如 styled-components 或 emotion）来更好地控制元素的尺寸和位置。
  `
]

const pEl = (content) => {
  return (
    <p>{content}</p>
  )
}

const listData: { content: string }[] = []
const data: Item[] = [];
for (let i = 0; i < 100; i += 1) {
  const c: ReactElement = i % 2 ? pEl(chats[0]) : pEl(chats[1])
  listData.push({
    content: i % 2 ? chats[0] : chats[1]
  })
  data.push({
    id: i,
    height: 30 + (i % 2 ? 70 : 0),
    content: c,
  })
}

interface ChatItem {
  id: number
  height: number
  role: string
  content: string
}

const MyChatItem: React.ForwardRefRenderFunction<HTMLDivElement, ChatItem> = ({ id, height, role, content }, ref) => {
  return role === 'user' ?
    <div ref={ref} className="flex justify-end pt-2" key={id}>
      <div className="max-w-[80%] w-[80%] rounded-2xl bg-gray-900 px-4 py-3 shadow-lg dark:bg-gray-800">
        <div className="text-sm font-medium">
          <ReactMarkdown className="text-slate-300 prose">
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div> : <div ref={ref} className="flex justify-start pt-2" key={id}>
      <div className="max-w-[80%] w-[80%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-950 dark:text-gray-50 overflow-y-scroll">
        <div className="text-sm font-medium">
          <ReactMarkdown className="prose">
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
}

const ForwardMyChatItem = forwardRef(MyChatItem);

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

const localVirChatList: { id: number, height: number, role: string, content: string }[] = []
for (let i = 0; i < 100; i++) {
  const c = { id: i, height: 10, role: i % 2 ? 'user' : 'assistant', content: i % 2 ? chats[0] : chats[1] }
  localVirChatList.push(c)
}
export default () => {
  // @ts-ignore
  const appVersion = __APP_VERSION__

  const { toast } = useToast()

  const [pinState, setPinState] = useState<boolean>(false)
  const [chatTitle, setChatTitle] = useState('NewChat')

  const [virChatList, setVirChatList] = useState(localVirChatList)
  const [virHeightList, setVirHeightList] = useState<number[]>()
  const [chatList, setChatList] = useState<{ role: string, content: string }[]>()

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
  const [sheetOpenState, setSheetOpenState] = useState(false)

  const sheetContentRef = useRef<HTMLDivElement>(null)
  const customPromptTextAreaRef = useRef<HTMLTextAreaElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const scrollAreaTopRef = useRef<HTMLDivElement>(null)
  const scrollAreaEndRef = useRef<HTMLDivElement>(null)
  const virtualDivRef = useRef<HTMLDivElement>(null)
  const divInputAreaRef = useRef<HTMLDivElement>(null)
  const divChatContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {

    setHeight(window.outerHeight * heightPercent)

    setTimeout(() => {
      if (virtualDivRef.current) {
        const childElements = virtualDivRef.current.children;
        // 遍历子元素并记录高度
        for (let i = 0; i < childElements.length; i++) {
          heights.push(childElements[i].clientHeight)
        }
        setVirHeightList([...heights])

        // 输出子元素的高度
        console.log('子元素的高度:', heights)
        virtualDivRef.current.style.display = 'none'
      }
    }, 0)

    // get config from main
    console.log('loading config')
    window.electron.ipcRenderer.invoke(GET_CONFIG).then((config: IAppConfig) => {
      setAppConfig({
        ...appConfig,
        ...config
      })
      setUseCustomePrompt(config?.prompt?.useCustomePrompt || false)
      setCustomPrompt(config?.prompt?.custom || '')
    })

    const handleMouseMove = debounce((event) => {
      // console.log();
      // event.target.style.backgroundColor = 'gray'
      // 检查鼠标是否靠近左边框，例如距离左边框 10 像素以内
      const threshold = 15
      const windowHeight = window.innerHeight
      const offset = windowHeight / 3
      if (event.clientX <= threshold && (event.clientY >= offset && event.clientY <= windowHeight - offset)) {
        // setMouseNearLeftSide(true);
        setSheetOpenState(true)
      } else {
        // setMouseNearLeftSide(false);
        if (sheetContentRef.current) {
          const sheetRect = sheetContentRef.current.getBoundingClientRect();
          const sheetRightEdge = sheetRect.right;

          if (event.clientX >= sheetRightEdge) {
            setSheetOpenState(false);
          }
        }
      }

      if (isResized.current) {
        const windowHeight = window.innerHeight
        const offset = windowHeight / 4
        if (event.clientY <= windowHeight / 2) {
          return
        }
        if (event.clientY >= windowHeight - offset) {
          return
        }
        setHeightPercent(event.clientY / windowHeight)
        setHeight(event.clientY)
      }
    }, 1)

    const handleResize = debounce(() => {
      setHeight(window.outerHeight * heightPercent);
    }, 2); // 防抖时间

    addEventListener('resize', handleResize)

    addEventListener('mousemove', handleMouseMove)
    addEventListener("mouseup", () => {
      isResized.current = false;
    })

    return () => {
      removeEventListener('mousemove', handleMouseMove) // Cleanup the event listener when the component unmounts
      removeEventListener('resize', handleResize) // Cleanup the event listener when the component unmounts
    }
  }, [])

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

  const [height, setHeight] = useState(580);
  const [hasMouseDown, setHasMouseDown] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [dragEnd, setDragEnd] = useState(0);
  const [heightPercent, setHeightPercent] = useState(0.65);
  const isResized = useRef(false);

  const onDragHandler = (e) => {
    console.log(e);
  }

  const onMouseDownHandler = (e) => {
    console.log('mouse-down', e);
    setHasMouseDown(true)
    setDragStart(e.clientY)
  }

  const onMouseLeaveHandler = (e) => {
    console.log('mouse-leave', e);
    if(hasMouseDown) {
      setDragEnd(e.clientY)
      setHasMouseDown(false)
    }
  }

  return (
    <div className="div-app app-dragable flex flex-col">
      <div
        className="div-header app-dragable fixed top-0 w-full shadow-lg pb-1 pr-2 pl-2 pt-1 flex items-center justify-between z-50 bg-transparent"
        style={{ userSelect: 'none' }}
      >
        <div className="app-dragable flex-1 space-x-2 flex ">
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

      <div className="app-dragable w-full h-screen flex flex-col pt-[45px]">
        <div ref={divChatContentRef} className="resize-animation app-dragable flex-1 flex flex-col h-full w-full">
          <div className="app-undragable bg-slate-100 h-full space-y-2 overflow-y-scroll scroll-smooth pl-1 pr-1 pt-2" style={{ height: `${height / 16}rem` }}>
          <List
              data={virChatList}
              itemHeight={10}
              itemKey="id"
              className="app-undragable mt-2"
              >
              { item => <ForwardMyChatItem {...item} /> }
            </List>
          </div>
        </div>
        <div ref={divInputAreaRef} className="resize-animation app-undragable flex-1 flex-grow flex flex-col">
          <div className="app-undragable bg-gray-300 h-1 cursor-row-resize"
            onMouseDown={() => {
              isResized.current = true;
            }}
            style={{ userSelect: 'none' }}
            onDrag={onDragHandler}
            onMouseDownCapture={onMouseDownHandler}
            onMouseLeave={onMouseLeaveHandler}
          />
          <div className="app-undragable">
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
          <div className="flex h-full app-undragable pb-px">
            <Textarea className="w-full text-md" placeholder="Anything you want yo ask..."></Textarea>
          </div>
          <Button className='fixed bottom-0 right-0 mr-2 mb-1.5 flex items-center' type="submit">
            Enter&ensp;<PaperPlaneIcon className="-rotate-45 mb-1.5" />
          </Button>
        </div>
      </div>
      {/* Sheet Section */}
      <Sheet open={sheetOpenState} onOpenChange={onoSheetOpenChange}>
        <SheetContent ref={sheetContentRef} side={"left"} className="[&>button]:hidden w-[50%]">
          <SheetHeader>
            <SheetTitle>@i</SheetTitle>
            <SheetDescription>
              -- Just an AI API client.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
      {/* 虚拟 div 用于记录子元素高度 */}
      <div ref={virtualDivRef} className={'div-vir-dom fixed -left-1 -top-1'} style={{ visibility: 'hidden' }}>
        {
          virChatList.map((item, index) => {
            return item.role === 'user' ? UserChatItem(index, item.content) : AssiatantChatItem(index, item.content)
          })
        }
      </div>
    </div>
  )
}
