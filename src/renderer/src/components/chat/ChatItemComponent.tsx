import React, { forwardRef, Ref} from 'react'
import ReactMarkdown from 'react-markdown'
import { cn } from "@renderer/lib/utils"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuTrigger } from "../ui/context-menu"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { CopyIcon, ReloadIcon, Cross2Icon, Pencil2Icon, ArrowDownIcon } from "@radix-ui/react-icons"
import { updateMessage } from "../../db/MessageRepository"
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { toast } from "@renderer/components/ui/use-toast"
import { SyntaxHighlighterWrapper, CodeCopyWrapper } from '../md/SyntaxHighlighterWrapper'
import { useChatContext } from '@renderer/context/ChatContext'

interface UserChatItemProps {
  idx: number
  message: MessageEntity
  msgSize: number
  reGenerate: Function
  elRef?: Ref<HTMLDivElement>
  className?: string
}

export const UserChatItemRef: React.FC<UserChatItemProps> = forwardRef<HTMLDivElement, UserChatItemProps>((props, ref) => {
  const { idx, message, msgSize, reGenerate, elRef, className } = props
  const { lastMsgStatus } = useChatContext()
  const onContextMenuClick = (e) => { }
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
  return (
    <ContextMenu key={idx} modal={true}>
      <ContextMenuTrigger asChild>
        <div ref={elRef} className={cn("flex justify-end pr-3 mb-2", className)} onContextMenu={onContextMenuClick}>
          {
            idx === msgSize && !lastMsgStatus && <span className="flex items-end pr-1 text-orange-500 font-bold text-lg"><i onClick={e => reGenerate(message.body.content)} className="ri-refresh-line"></i></span>
          }
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 shadow bg-gray-50 dark:bg-gray-100")}>
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
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw]}
                            remarkRehypeOptions={{ passThrough: ['link'] }}
                            className={cn("prose prose-code:text-gray-400 text-md font-medium max-w-[100%] text-white dark:text-white transition-all duration-400 ease-in-out")}
                            components={{
                              code(props) {
                                const { children, className, node, ...rest } = props
                                const match = /language-(\w+)/.exec(className || '')
                                return match ? (
                                  <CodeCopyWrapper code={String(children).replace(/\n$/, '')}>
                                    <SyntaxHighlighterWrapper
                                    children={String(children).replace(/\n$/, '')}
                                    language={match[1]}
                                    />
                                  </CodeCopyWrapper>
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
              ) : (
                <ReactMarkdown
                  key={idx}
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  remarkRehypeOptions={{ passThrough: ['link'] }}
                  className={cn("prose prose-code:text-gray-400 text-md text-gray-600 dark:text-gray-700 font-medium max-w-[100%] transition-all duration-400 ease-in-out")}
                  components={{
                    code(props) {
                      const { children, className, node, ...rest } = props
                      const match = /language-(\w+)/.exec(className || '')
                      return match ? (
                        <CodeCopyWrapper code={String(children).replace(/\n$/, '')}>
                          <SyntaxHighlighterWrapper
                          children={String(children).replace(/\n$/, '')}
                          language={match[1]}
                          />
                        </CodeCopyWrapper>
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
        <ContextMenuItem onClick={_ => doRegenerate(message.body)}>Redo<ContextMenuShortcut><ReloadIcon /></ContextMenuShortcut></ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

interface AssistantChatItemProps {
  idx: number
  msgSize: number
  message: MessageEntity
  editableContentId: number
  setEditableContentId: Function
  elRef?: Ref<HTMLDivElement>
}

export const AssistantChatItemRef: React.FC<AssistantChatItemProps> = forwardRef<HTMLDivElement, AssistantChatItemProps>((props: AssistantChatItemProps, ref) => {
  const { idx, msgSize, message, editableContentId, setEditableContentId, elRef } = props
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
        <div ref={elRef} key={idx} className="flex justify-start mb-2">
        <div className="max-w-[85%] rounded-2xl px-4 py-3 shadow bg-white dark:bg-gray-900 overflow-y-scroll">
              {/* <div className='bg-gray-200 p-2 mb-2 rounded-xl text-gray-700'>{message.body.reasoning as string}</div> */}
              <Accordion defaultValue={'reasoning-' + idx} type="single" collapsible className='bg-gray-50 pl-0.5 pr-0.5 rounded-xl'>
                <AccordionItem value={'reasoning-' + idx}>
                  <AccordionTrigger className='text-sm text-gray-600 h-10'>Reasoning<ArrowDownIcon></ArrowDownIcon></AccordionTrigger>
                  <AccordionContent>
                    <div className='bg-gray-100 p-2 rounded-xl text-gray-500 min-w-96'>{(message.body.reasoning as string).replaceAll('<', '\<').replaceAll('>', '\>')}</div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                remarkRehypeOptions={{ passThrough: ['link'] }}
                className="prose dark:prose-invert prose-code:text-gray-400 dark:prose-code:text-gray-100 dark:text-slate-300 text-md font-medium max-w-[100%] transition-all duration-400 ease-in-out"
                components={{
                  code(props) {
                    const { children, className, node, ...rest } = props
                    const match = /language-(\w+)/.exec(className || '')
                    return match ? (
                      <CodeCopyWrapper code={String(children).replace(/\n$/, '')}>
                        <SyntaxHighlighterWrapper
                        children={String(children).replace(/\n$/, '')}
                        language={match[1]}
                        />
                      </CodeCopyWrapper>
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
                        <span onClick={e => setEditableContentId(-1)} className="bg-red-500 rounded-full text-white p-0.5"><Cross2Icon className="transition-all duration-400 ease-in-out hover:transform hover:rotate-180"></Cross2Icon></span>
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
})