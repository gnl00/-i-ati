import React, { memo, useState } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@renderer/components/ui/accordion"
import { toast } from 'sonner'
import { Badge } from "@renderer/components/ui/badge"
import { CopyIcon, ReloadIcon, Pencil2Icon } from '@radix-ui/react-icons'
import { BadgePercent, BadgeCheck, BadgeX } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { CodeWrapper } from '@renderer/components/markdown/SyntaxHighlighterWrapper'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
// import rehypeRaw from 'rehype-raw'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';

interface ChatMessageComponentProps {
  index: number
  message: ChatMessage
  isLatest: boolean
}

const ChatMessageComponent: React.FC<ChatMessageComponentProps> = memo(({ index, message: m, isLatest }) => {

  const [userMessageOperationIdx, setUserMessageOperationIdx] = useState<number>(-1)
  const [assistantMessageHovered, setAssistantMessageHovered] = useState<boolean>(false)

  const onCopyClick = (content: string) => {
    if (content) {
      navigator.clipboard.writeText(content)
      toast.success('Copied', {duration: 800})
    }
  }
  const onMouseHoverUsrMsg = (idx: number) => {
    setUserMessageOperationIdx(idx)
  }
  const onMouseHoverAssistantMsg = (hovered: boolean) => {
    setAssistantMessageHovered(hovered)
  }

  if (m.role === 'user') {
    return m.content ? (
      <div id='usr-message' className={cn("flex flex-col items-end mr-1", index === 0 ? 'mt-2' : '')}>
        <div id="usr-msg-content" onMouseEnter={_ => onMouseHoverUsrMsg(index)} onMouseLeave={_ => onMouseHoverUsrMsg(-1)} className={cn("max-w-[85%] rounded-xl py-3 px-3 bg-slate-100 dark:bg-gray-100")}>
          {typeof m.content !== 'string' ? (
            <>
              <div className="">
                {m.content.map((vlmContent: VLMContent, idx) => {
                  if (vlmContent.image_url) {
                    return <img key={idx} src={vlmContent.image_url?.url} onDoubleClick={e => e}></img>
                  } else {
                    return (
                      <ReactMarkdown
                        key={idx}
                        remarkPlugins={[remarkGfm]}
                        // rehypePlugins={[rehypeRaw]} // 把原本会被当作纯文本的 HTML 片段，重新解析成真正的 HTML 节点
                        skipHtml={false}
                        className={cn("prose prose-code:text-gray-400 text-base text-blue-gray-600 font-medium max-w-[100%] dark:text-white transition-all duration-400 ease-in-out")}
                        components={{
                          pre(props) {
                            const { children, ...rest } = props
                            return <>{children}</>
                          },
                          code(props) {
                            const { children, className, node, ...rest } = props
                            const match = /language-(\w+)/.exec(className || '')
                            return match ? (
                              <CodeWrapper
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
                        {vlmContent.text}
                      </ReactMarkdown>
                    )
                  }
                })}
              </div>
            </>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              // rehypePlugins={[rehypeRaw]} // 把原本会被当作纯文本的 HTML 片段，重新解析成真正的 HTML 节点
              skipHtml={false}
              className={cn("prose prose-code:text-gray-400 text-base text-blue-gray-600 dark:text-gray-700 font-medium max-w-[100%] transition-all duration-400 ease-in-out")}
              components={{
                pre(props) {
                  const { children, ...rest } = props
                  return <>{children}</>
                },
                code(props) {
                  const { children, className, node, ...rest } = props
                  const match = /language-(\w+)/.exec(className || '')
                  return match ? (
                    <CodeWrapper
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
              {m.content as string}
            </ReactMarkdown>
          )}
        </div>
        <div
          id="usr-msg-operation"
          className={cn(
            "mt-0.5 pr-2 space-x-1 flex text-gray-400 min-h-[1.5rem] transition-opacity duration-200",
            userMessageOperationIdx === index ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center">
            <CopyIcon onClick={_ => onCopyClick(m.content as string)}></CopyIcon>
          </div>
          <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center">
            <Pencil2Icon></Pencil2Icon>
          </div>
        </div>
      </div>
    ) : null
  }

  return (m) ? (
    <div id='assistant-message' className={cn("flex justify-start flex-col pb-0.5", index === 0 ? 'mt-2' : '')}>
      <div
        onMouseEnter={_ => onMouseHoverAssistantMsg(true)}
        onMouseLeave={_ => onMouseHoverAssistantMsg(false)}
        className="rounded-xl bg-gray-50 dark:bg-gray-900 overflow-y-scroll"
      >
        {m.model && (
          <Badge variant="outline" className='select-none text-gray-700 mb-1'>@{m.model}</Badge>
        )}
        {m.reasoning && !m.artifatcs && (
          <Accordion defaultValue={'reasoning-' + index} type="single" collapsible className='pl-0.5 pr-0.5 rounded-xl'>
            <AccordionItem value={'reasoning-' + index}>
              <AccordionTrigger className='text-sm h-10'>
                <Badge variant={'secondary'} className="text-gray-600 bg-blue-gray-100 hover:bg-blue-gray-200 space-x-1">
                  <BadgePercent className="w-4" />
                  <span>Thinking</span>
                </Badge>
              </AccordionTrigger>
              <AccordionContent className="bg-blue-gray-100 p-1 border-none rounded-xl">
                <div className='text-blue-gray-500 pb-2 pl-1 pr-1 border-none'>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    skipHtml={false}
                    className="prose px-0.5 py-0.5 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-4 prose-hr:mb-4 prose-code:text-gray-400 dark:prose-code:text-gray-100 dark:text-slate-300 transition-all duration-400 ease-in-out"
                    >{(m.reasoning as string)}</ReactMarkdown>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {
          m.toolCallResults && m.toolCallResults.length > 0 && m.toolCallResults.map((tc, idx) => (
            <Accordion id="accordion-tool-call-result" key={idx} type="single" collapsible className='pl-0.5 pr-0.5 rounded-xl shadow-inner border-[1px]'>
              <AccordionItem value={'tool-use-' + index} className='border-none'>
                <AccordionTrigger className='text-sm h-10 flex'>
                  <Badge variant={'outline'} className={cn("bg-blue-gray-100 hover:bg-blue-gray-200 space-x-1", !tc.isError ? 'text-green-600' : 'text-red-500')}>
                    {
                      !tc.isError ? <BadgeCheck className="w-4" /> : <BadgeX className="w-4" />
                    }
                    <span>{tc.name}</span>
                  </Badge>
                </AccordionTrigger>
                <AccordionContent className="border-none rounded-xl pb-0">
                  <SyntaxHighlighter language="json" style={docco}>
                    {JSON.stringify(tc.content, null, 2)}
                  </SyntaxHighlighter>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ))
        }
        {
          m.content && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              // rehypePlugins={[rehypeRaw]} // rehypeRaw 把原本会被当作纯文本的 HTML 片段，重新解析成真正的 HTML 节点
              rehypePlugins={[rehypeKatex]}
              skipHtml={false}
              remarkRehypeOptions={{ passThrough: ['link'] }}
              className="prose px-2 text-base text-blue-gray-600 dark:prose-invert prose-hr:mt-4 prose-hr:mb-4 prose-p:mb-4 prose-p:mt-4 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out"
              components={{
                pre(props) {
                  const { children, ...rest } = props
                  return <>{children}</>
                },
                code(props) {
                  const { children, className, node, ...rest } = props
                  const match = /language-(\w+)/.exec(className || '')
                  return match ? (
                    <CodeWrapper
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
            {m.content as string}
            </ReactMarkdown>
          )
        }
      </div>
      <div
        className={cn(
          "mt-0.5 pl-2 space-x-1 flex text-gray-500 min-h-[1.5rem] transition-opacity duration-200",
          assistantMessageHovered ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center">
          <CopyIcon onClick={_ => onCopyClick(m.content as string)}></CopyIcon>
        </div>
        {isLatest && (
          <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center">
            <ReloadIcon></ReloadIcon>
          </div>
        )}
        <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center">
          <Pencil2Icon></Pencil2Icon>
        </div>
      </div>
    </div>
  ) : null
})

export default ChatMessageComponent