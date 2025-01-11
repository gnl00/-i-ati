import React, { useEffect, forwardRef, Ref } from 'react'
import ReactMarkdown from 'react-markdown'
import { cn } from "@renderer/lib/utils"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuTrigger } from "../ui/context-menu"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { CopyIcon, ReloadIcon, Cross2Icon, Pencil2Icon } from "@radix-ui/react-icons"
import { updateMessage } from "../../db/MessageRepository"
import { PrismAsync as SyntaxHighlighter } from 'react-syntax-highlighter'
import { dracula, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { debounce } from 'lodash'
import AnimateHeight from 'react-animate-height'

interface UserChatItemProps {
  idx: number
  message: MessageEntity
  msgSize: number
  lastMsgStatus: boolean
  reGenerate: Function
  toast: Function
  itemRef?: Ref<HTMLDivElement>
}

export const UserChatItemRef: React.FC<UserChatItemProps> = forwardRef<HTMLDivElement, UserChatItemProps>((props, ref) => {
  const { idx, message, msgSize, lastMsgStatus, reGenerate, toast, itemRef } = props
  // useEffect(() => {
  //   console.log('user', idx, itemRef);
  //   if (idx === msgSize - 1) {
  //     itemRef.current?.scrollIntoVew()
  //   }
  // }, [])
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
        <div ref={itemRef} className={cn("flex justify-end pr-3 mb-2")} onContextMenu={onContextMenuClick}>
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
                            className={cn("prose prose-code:text-gray-400 text-md font-medium max-w-[100%] text-slate-200 dark:text-slate-400 transition-all duration-400 ease-in-out")}
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
              ) : (
                <ReactMarkdown
                  key={idx}
                  className={cn("prose prose-code:text-gray-400 text-md font-medium max-w-[100%] text-slate-200 transition-all duration-400 ease-in-out")}
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
        <ContextMenuItem onClick={_ => doRegenerate(message.body)}>Redo<ContextMenuShortcut><ReloadIcon /></ContextMenuShortcut></ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

export const UserChatItem = (props: UserChatItemProps) => {
  const { idx, message, msgSize, lastMsgStatus, reGenerate, toast } = props
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
  // const PreTag = () => {
  //     return <div className="border-2 border-red-500"><Button className="absolute top-0">Copy</Button></div>
  // }
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
                          className={cn("prose prose-code:text-gray-400 text-md font-medium max-w-[100%] text-slate-200 dark:text-slate-400 transition-all duration-400 ease-in-out")}
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
            ) : (
              <ReactMarkdown
                key={idx}
                className={cn("prose prose-code:text-gray-400 text-md font-medium max-w-[100%] text-slate-200 transition-all duration-400 ease-in-out")}
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
        <ContextMenuItem onClick={_ => doRegenerate(message.body)}>Redo<ContextMenuShortcut><ReloadIcon /></ContextMenuShortcut></ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface AssistantChatItemProps {
  idx: number
  msgSize: number
  message: MessageEntity
  editableContentId: number
  setEditableContentId: Function
  toast: Function
  itemRef?: Ref<HTMLDivElement>
}

const PreTag = (props) => {
  return <div className="preTag" {...props}></div>
}

const MemoSyntaxHighlighter = React.memo(SyntaxHighlighter)

const SyntaxHighlighterWrapper = React.memo(({ children, language }: { children: string, language: string }) => {
  return (
    <MemoSyntaxHighlighter
      // customStyle={{ padding: '0', maxHeight: '300px', overflow: 'scroll' }}
      customStyle={{ padding: '0' }}
      PreTag={PreTag}
      children={String(children).replace(/\n$/, '')}
      language={language}
      style={dracula}
      wrapLongLines={true}
    />
  );
});

export const AssistantChatItemRef: React.FC<AssistantChatItemProps> = forwardRef<HTMLDivElement, AssistantChatItemProps>((props: AssistantChatItemProps, ref) => {
  const { idx, msgSize, message, toast, editableContentId, setEditableContentId, itemRef } = props
  // useEffect(() => {
  //   console.log('assistant', idx, itemRef);
  //   if (idx === msgSize - 1) {
  //     itemRef.current?.scrollIntoVew()
  //   }
  // }, [])
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
        <div ref={itemRef} key={idx} className="flex justify-start mb-2">
        <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-900 shadow-lg dark:bg-gray-400 dark:text-slate-50 overflow-y-scroll">
              <ReactMarkdown
                className="prose prose-code:text-gray-400 text-md font-medium max-w-[100%] transition-all duration-400 ease-in-out"
                components={{
                  code(props) {
                    const { children, className, node, ...rest } = props
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

export const AssistantChatItem: React.FC<AssistantChatItemProps> = ({ idx, message, toast, editableContentId, setEditableContentId }) => {
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
              className="prose prose-code:text-gray-400 text-md font-medium max-w-[100%] transition-all duration-400 ease-in-out"
              components={{
                code(props) {
                  const { children, className, node, ...rest } = props
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
}

const AssistantChatItem1 = (props: AssistantChatItemProps) => {
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
              className="prose prose-code:text-gray-400 text-md font-medium max-w-[100%] transition-all duration-400 ease-in-out"
              components={{
                code(props) {
                  const { children, className, node, ...rest } = props
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
        <ContextMenuItem onClick={_ => onEditClick(idx, message.body.content)}>Edit<ContextMenuShortcut><Pencil2Icon /></ContextMenuShortcut></ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}