import React, { memo, useState } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@renderer/components/ui/accordion"
import { toast } from '@renderer/components/ui/use-toast'
import { Badge } from "@renderer/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@renderer/components/ui/tooltip"
import { CopyIcon, ReloadIcon, Pencil2Icon, CodeIcon } from '@radix-ui/react-icons'
import { BadgePercent } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { SyntaxHighlighterWrapper, CodeCopyWrapper } from '@renderer/components/md/SyntaxHighlighterWrapper'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useChatStore } from '@renderer/store'

interface ChatMessageComponentProps {
  index: number
  message: ChatMessage
  isLatest: boolean
}

const ChatMessageComponent: React.FC<ChatMessageComponentProps> = memo(({ index, message: m, isLatest }) => {

const {readStreamState} = useChatStore()

  const [showArtifactsCode, setShowArtifactsCode] = useState<boolean>(false)

  const extractArtifactContent = (content: string): string => {
    // 匹配 <antArtifact> 标签并提取其中的内容
    const antArtifactRegex = /<antArtifact[^>]*>([\s\S]*?)<\/antArtifact>/
    const match = content.match(antArtifactRegex)
    
    if (match && match[1]) {
      // 返回 antArtifact 标签中的内容，去除首尾空白
      return match[1].trim() // 第 1 个捕获组，它匹配 <antArtifact> 和 </antArtifact> 之间的所有内容（包括换行符）。
    }
    
    // 如果没有找到 antArtifact 标签，返回原内容
    return content
  }

  const extractArtifactAttributes = (content: string) => {
    const antArtifactRegex = /<antArtifact\s+([^>]*?)>([\s\S]*?)<\/antArtifact>/
    const match = content.match(antArtifactRegex)
    
    if (match) {
      const attributes = match[1]
      const innerContent = match[2].trim()
      
      // 解析属性
      const identifierMatch = attributes.match(/identifier=["']([^"']*?)["']/)
      const typeMatch = attributes.match(/type=["']([^"']*?)["']/)
      const titleMatch = attributes.match(/title=["']([^"']*?)["']/)
      
      return {
        identifier: identifierMatch ? identifierMatch[1] : '',
        type: typeMatch ? typeMatch[1] : '',
        title: titleMatch ? titleMatch[1] : '',
        content: innerContent
      }
    }
    
    return null
  }

  const onCopyClick = (content: string) => {
    if (content) {
      const extractedContent = extractArtifactContent(content)
      navigator.clipboard.writeText(extractedContent)
      toast({
          variant: 'default',
          duration: 800,
          className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
          description: `✅ Copied`,
      })
    }
  }

  const toggleShowCode = () => {
    setShowArtifactsCode(!showArtifactsCode)
  }

  if (m.role === 'user') {
    return m.content ? (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div id='use-message' className={cn("flex justify-end mr-1", index === 0 ? 'mt-2' : '')}>
              <div className={cn("max-w-[85%] rounded-xl py-3 px-3 bg-blue-50 dark:bg-gray-100")}>
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
                    remarkPlugins={[remarkGfm]}
                    // rehypePlugins={[rehypeRaw]} // 把原本会被当作纯文本的 HTML 片段，重新解析成真正的 HTML 节点
                    skipHtml={false}
                    className={cn("prose prose-code:text-gray-400 text-base text-blue-gray-600 dark:text-gray-700 font-medium max-w-[100%] transition-all duration-400 ease-in-out")}
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
                    {m.content as string}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className='bg-white/5 backdrop-blur-xl p-1 px-2 border-none' side='bottom' align='end'>
            <div className="space-x-2 flex">
              <CopyIcon className='w-6 h-6 hover:bg-gray-200 p-1 rounded-xl text-gray-500' onClick={_ => onCopyClick(m.content as string)}></CopyIcon>
              <Pencil2Icon className='w-6 h-6 hover:bg-gray-200 p-1 rounded-xl text-gray-500'></Pencil2Icon>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : null
  }
  
  return (m.content || m.reasoning) ? (
    <div id='assistant-message' className={cn("flex justify-start flex-col pb-0.5", index === 0 ? 'mt-2' : '')}>
      <div className="rounded-xl bg-gray-50 dark:bg-gray-900 overflow-y-scroll">
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
                <div className='text-blue-gray-500 pb-2 pl-1 pr-1 border-none'>{(m.reasoning as string)}</div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {
          m.artifatcs && !showArtifactsCode
          ? (
            <div id="artifacts" className={cn("border rounded-lg overflow-hidden", readStreamState ? "animate-pulse" : "")}>
              {(() => {
                const artifactData = extractArtifactAttributes(m.content as string)
                if (artifactData) {
                  return (
                    <div>
                      <div className="bg-gray-100 px-3 py-2 border-b text-sm text-gray-600">
                        <span className="font-medium">{artifactData.title}</span>
                        {artifactData.type && (
                          <span className="ml-2 text-xs bg-gray-200 px-2 py-1 rounded">
                            {artifactData.type}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <iframe
                          srcDoc={artifactData.content}
                          className="w-full h-96 border-none"
                          title={artifactData.title}
                          sandbox="allow-scripts allow-same-origin"
                        />
                      </div>
                    </div>
                  )
                } else {
                  return (
                    <div className="p-4 text-gray-500 text-center">
                      ...
                    </div>
                  )
                }
              })()}
            </div>
          )
          : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              // rehypePlugins={[rehypeRaw]} // 把原本会被当作纯文本的 HTML 片段，重新解析成真正的 HTML 节点
              skipHtml={false}
              remarkRehypeOptions={{ passThrough: ['link'] }}
              className="prose px-2 py-2 text-base text-blue-gray-600 dark:prose-invert prose-hr:mt-4 prose-hr:mb-4 prose-code:text-gray-400 dark:prose-code:text-gray-100 dark:text-slate-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out"
              components={{
                pre(props) {
                  const { children, ...rest } = props
                  return <>{children}</>
                },
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
            {
              showArtifactsCode ? `\`\`\`\n${extractArtifactContent(m.content as string)}\n\`\`\`` : m.content as string
            }
            </ReactMarkdown>
          ) 
        }
      </div>
      <div className="mt-0.5 pl-2 space-x-1 flex text-gray-500">
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
        {
          m.artifatcs && (
            <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center">
              <CodeIcon onClick={_ => toggleShowCode()}></CodeIcon>
            </div>
          )
        }
      </div>
    </div>
  ) : null
})

export default ChatMessageComponent