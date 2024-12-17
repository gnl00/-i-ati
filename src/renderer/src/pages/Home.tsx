import { Button } from '@renderer/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@renderer/components/ui/accordion'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Textarea } from '@renderer/components/ui/textarea'
import { Separator } from '@renderer/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import {
  GearIcon,
  DrawingPinIcon,
  DrawingPinFilledIcon,
  QuestionMarkCircledIcon,
  SpaceEvenlyHorizontallyIcon,
  ChevronDownIcon
} from '@radix-ui/react-icons'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
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
import { Switch } from "@renderer/components/ui/switch"
import { useEffect, useRef, useState } from 'react'
import { PIN_WINDOW, GET_CONFIG, OPEN_EXTERNAL, SAVE_CONFIG } from '@constants/index'
import { translateRequestWithHook, chatRequestWithHook } from '@request/index'
import ReactMarkdown from 'react-markdown'
import List from 'rc-virtual-list'

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

const Home = (): JSX.Element => {

  // @ts-ignore
  const appVersion = __APP_VERSION__

  const customPromptTextAreaRef = useRef<HTMLTextAreaElement>(null)

  const [pinState, setPinState] = useState<boolean>(false)
  const [appConfig, setAppConfig] = useState<IAppConfig>({
    api: 'https://api.siliconflow.cn/v1/chat/completions',
    token: '',
    prompt: {
      embedded: ''
    },
    model: 'Qwen/Qwen2.5-Coder-7B-Instruct'
  })
  const [translateText, setTranslateText] = useState('')
  const [selectedModel, setSelectedModel] = useState('Qwen/Qwen2.5-Coder-32B-Instruct')
  const [chatTitle, setChatTitle] = useState('NewChat')
  const [chatList, setChatList] = useState([{role: '', content: ''}])
  const [markdownResultKey, setMarkdownResultKey] = useState(new Date().getTime())
  const [fetching, setFetchingState] = useState<boolean>(false)
  const [useCustomePrompt, setUseCustomePrompt] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  const markdownResultRef = useRef<HTMLDivElement>(null)
  const scrollAreaEndRef = useRef<HTMLDivElement>(null)

  const { toast } = useToast()

  const headerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const inputPanelRef = useRef<HTMLDivElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // get config from main
    console.log('loading config')
    window.electron.ipcRenderer.invoke(GET_CONFIG).then((config: IAppConfig) => {
      // console.log('got from main: ', config)
      setAppConfig({
        ...appConfig,
        ...config
      })
      setUseCustomePrompt(config?.prompt?.useCustomePrompt || false)
      setCustomPrompt(config?.prompt?.custom || '')
    })

    const adjustScrollAreaHeight = () => {
      if (scrollAreaRef.current && inputAreaRef.current) {
        const inputAreaHeight = inputAreaRef.current.offsetHeight
        const viewportHeight = window.innerHeight
        scrollAreaRef.current.style.height = `${viewportHeight - inputAreaHeight - 50}px`
      }
    }

    adjustScrollAreaHeight()
    window.addEventListener('resize', adjustScrollAreaHeight)

    return () => {
      window.removeEventListener('resize', adjustScrollAreaHeight)
    }

  }, [])

  // useEffect(() => {
  //   // update markdown result key
  //   setMarkdownResultKey(new Date().getTime())
  // }, [translateResult])

  useEffect(() => {
    // console.log('chatList update')
    // console.log(chatList)
    // auto scroll to the end
    scrollAreaEndRef.current?.scrollIntoView({behavior: 'auto'})
  }, [chatList])

  const onPinToggleClick = (): void => {
    setPinState(!pinState)

    // pin window
    window.electron.ipcRenderer.invoke(PIN_WINDOW, !pinState)
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

  const onTokenQuestionClick = (url: string): void => {
    console.log('token question click');
    
    // window.electron.ipcRenderer.openex
    // shell.openExternal('www.baidu.com')
    window.electron.ipcRenderer.invoke(OPEN_EXTERNAL, url)
  }

  const onTranslateTextChange = (evt) => {
    setTranslateText(evt.target.value)
  }

  const beforeFetch = () => {
    setFetchingState(true)
  }

  const afterFetch = () => {
    setFetchingState(false)
  }

  const onSubmitClick = async (): Promise<void> => {
    if (!translateText) {
      return
    }

    // chatList.push([...chatList, {user: true, text: translateText}])
    const userChat = {role: "user", content: translateText}
    setChatList([...chatList, userChat])

    setTranslateText('')

    // // set result empty first
    // if (translateResult) {
    //   setTranslateResult('')
    //   setMarkdownResultKey(new Date().getTime())
    //   if (markdownResultRef && markdownResultRef.current != null) {
    //     markdownResultRef.current.innerHTML = ''
    //   }
    // }

    // // as fallback, in case of switch to use custom prompt but no input
    // let rawPrompt: string = appConfig!.prompt!.embedded!
    // if (useCustomePrompt && customPrompt) {
    //   rawPrompt = customPrompt
    // }
    // const prompt = rawPrompt.replace(/{{sourceLang}}/g, sourceLanguage).replace(/{{targetLang}}/g, targetLanguage)
    
    const req: IChatRequest = {
      url: appConfig.api!,
      content: translateText,
      token: appConfig.token!,
      prompt: '',
      model: selectedModel
    }

    const reader = await chatRequestWithHook(req, beforeFetch, afterFetch)

    if (!reader) {
      return
    }

    let preResult = ''
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
        preResult += resultText || ''
        // console.log(preResult += resultText || '')
      })
      setChatList([...chatList, userChat, {role: 'assiatant', content: preResult}])
  
      if (eventDone) {
        break
      }
    }
    if (!chatTitle || chatTitle === 'NewChat') {
      generateTitle(translateText)
    }
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
  }

  const onPropmtSwicterChange = (value: boolean) => {
    setUseCustomePrompt(value)
    onConfigurationsChange({...appConfig, prompt: {...appConfig.prompt, useCustomePrompt: value}})
  }

  const onCustomPromptSave = () => {
    if (customPromptTextAreaRef && customPromptTextAreaRef.current != null) {
      const value = customPromptTextAreaRef.current.value
      setCustomPrompt(value)
      onConfigurationsChange({ ...appConfig, prompt: {...appConfig.prompt, custom: value}})
    }
  }

  const listRenderer = () => {
    return <ChatComponent list={chatList}/>
  }

  const onSelectModelChange = (val) => {
    setSelectedModel(val)
  }

  const onResize = sizes => {
    console.log(sizes)
    const upperPercent = sizes[0]
    const lowerPercent = sizes[1]
    if (textAreaRef.current) {
      const currHeight = window.innerHeight * (lowerPercent / 100)
      textAreaRef.current.style.height = `${currHeight - 100}px`
    }

    if (scrollAreaRef.current && inputPanelRef.current) {
      const inputAreaHeight = inputPanelRef.current.offsetHeight
      const viewportHeight = window.innerHeight
      scrollAreaRef.current.style.height = `${viewportHeight - inputAreaHeight - 50}px`
    }
  }

  return (
    <>
      <div className="m-2 app-dragable">
        <div ref={headerRef} className="flex justify-between w-full space-x-2">
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
                                  className="h-96 w-96 text-base text-slate-600"
                                  defaultValue={appConfig.prompt?.custom}
                                  placeholder='Input your custom prompt here...
                                    &#10;We offer 2 variables&#10;- {{sourceLang}}&#10;- {{targetLang}}&#10;as placeholders.
                                    &#10;Example&#10;请以简洁，幽默的语气将{{sourceLang}}准确的翻译成{{targetLang}}并按照...格式输出。'
                                />
                                <DialogFooter className="justify-start">
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
          <div className='app-undragable flex space-x-2'>
          <Button className='h-auto w-auto' variant='secondary' size='sm'>{chatTitle}</Button>
          </div>
          <Toggle className="app-undragable" size="xs" variant="outline" onClick={onPinToggleClick}>
            {pinState ? <DrawingPinFilledIcon /> : <DrawingPinIcon />}
          </Toggle>
        </div>
        <Separator style={{ margin: '10px 0' }} />
        <ResizablePanelGroup
            direction="vertical"
            className="app-undragable min-h-[88vh] md:min-h-[90vh] lg:min-h-[93vh] w-full rounded-lg border pb-2"
            onLayout={onResize}
            >
              <ResizablePanel defaultSize={75}>
                <div className="flex h-full items-center justify-center">
                <ScrollArea ref={scrollAreaRef} className="smooth-scroll app-undragable h-96 w-full rounded-md border">
                  <div className=" flex flex-col gap-4 pr-2 pl-2 pt-4 pb-2">
                    <div className="flex justify-end" key={1}>
                      <div className="max-w-[80%] rounded-2xl bg-gray-900 px-4 py-3 shadow-lg dark:bg-gray-800">
                        <p className="text-sm font-medium">
                          <ReactMarkdown className="prose text-slate-300">
                          react-window 是一个用于优化大规模列表渲染性能的库。在处理聊天记录列表时，计算每条聊天记录的高度可能并不总是那么简单，因为高度取决于很多因素，例如字体大小、行高、是否包含图片或链接等。
                          </ReactMarkdown>
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-start " key={2}>
                      <div className="max-w-[80%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-950 dark:text-gray-50 overflow-y-scroll">
                        <p className="text-sm font-medium">
                          <ReactMarkdown className="prose">
                          动态调整高度：如果聊天记录的高度是动态变化的（例如包含图片或链接），你可能需要在每次消息内容更新时重新计算高度。这可以通过监听 message 的变化并重新渲染组件来实现。
                          注意：这种方法可能不适用于所有情况，特别是当聊天记录的高度依赖于复杂布局或动态内容时。在这种情况下，你可能需要考虑使用更复杂的布局管理库（如 styled-components 或 emotion）来更好地控制元素的尺寸和位置。

                          动态调整高度：如果聊天记录的高度是动态变化的（例如包含图片或链接），你可能需要在每次消息内容更新时重新计算高度。这可以通过监听 message 的变化并重新渲染组件来实现。
                          注意：这种方法可能不适用于所有情况，特别是当聊天记录的高度依赖于复杂布局或动态内容时。在这种情况下，你可能需要考虑使用更复杂的布局管理库（如 styled-components 或 emotion）来更好地控制元素的尺寸和位置。
                          </ReactMarkdown>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div id="scrollAreaEnd" ref={scrollAreaEndRef}></div>
                </ScrollArea>
                </div>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={25} minSize={25} maxSize={50}>
                <div ref={inputPanelRef} className="flex flex-col h-full items-center justify-center pl-1 pr-1 pb-0">
                <div className='w-full flex justify-start pb-0.5'>
                <Select onValueChange={onSelectModelChange} defaultValue={selectedModel}>
                  <SelectTrigger className="w-auto h-auto">
                    <SelectValue/>
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
                <div className="app-undragable flex w-full items-end space-x-2 backdrop-blur-sm">
                  <Textarea ref={textAreaRef} onChange={onTranslateTextChange} defaultValue={translateText} value={translateText} className=" bg-slate-50 text-md" placeholder="Anything you want to ask..." />
                  <Button className='fixed bottom-0 right-0' size="sm" type="submit" onClick={onSubmitClick}>
                    Enter
                  </Button>
                </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
        <Toaster />
      </div>
    </>
  )
}

const ChatComponent = (props: {list: {role: string, content: string}[]}) => {
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
  return <div className="flex justify-end" key={key}>
  <div className="max-w-[80%] rounded-2xl bg-gray-900 px-4 py-3 shadow-lg dark:bg-gray-800">
    <p className="text-sm font-medium">
      <ReactMarkdown className="prose text-slate-300">
        {content}
      </ReactMarkdown>
    </p>
  </div>
</div>
}

const AssiatantChatItem = (key, content) => {
  return <div className="flex justify-start" key={key}>
  <div className="max-w-[80%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-950 dark:text-gray-50 overflow-y-scroll">
    <p className="text-sm font-medium">
      <ReactMarkdown className="prose">
        {content}
      </ReactMarkdown>
    </p>
  </div>
</div>
}

export default Home
