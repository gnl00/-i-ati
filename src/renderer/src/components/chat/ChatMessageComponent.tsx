import { CopyIcon, Pencil2Icon, ReloadIcon } from '@radix-ui/react-icons'
import { CodeWrapper } from '@renderer/components/markdown/SyntaxHighlighterWrapper'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@renderer/components/ui/accordion"
import { Badge } from "@renderer/components/ui/badge"
import { cn } from '@renderer/lib/utils'
import { invokeOpenExternal } from '@renderer/invoker/ipcInvoker'
import { BrainCircuit } from 'lucide-react'
import React, { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { toast } from 'sonner'

import { useTheme } from '@renderer/components/theme-provider'
import { useChatStore } from '../../store'
import { ToolCallResult } from './ToolCallResult'
import { useSegmentTypewriter } from '../../hooks/useSegmentTypewriter'

interface ChatMessageComponentProps {
  index: number
  message: ChatMessage
  isLatest: boolean
}

// Shared markdown code components for both user and assistant messages
const markdownCodeComponent = {
  pre(props) {
    const { children } = props
    // Remove pre styling - let CodeWrapper handle all styling
    return <div className="not-prose">{children}</div>
  },
  code(props) {
    const { children, className, node, ...rest } = props
    const match = /language-(\w+)/.exec(className || '')

    // Convert children to string for analysis
    const textContent = String(children)

    // Check if this is a code block (contains newlines) or inline code
    const isCodeBlock = textContent.includes('\n') || className?.startsWith('language-')

    // Exclude 'language-math' - let rehypeKatex handle it
    if (match && match[1] !== 'math') {
      return (
        <CodeWrapper
          children={textContent.replace(/\n$/, '')}
          language={match[1]}
        />
      )
    }

    // Handle code blocks without language specifier (like file structures)
    if (isCodeBlock && !match) {
      return (
        <CodeWrapper
          children={textContent.replace(/\n$/, '')}
          language="plaintext"
        />
      )
    }

    // For math or inline code, use default rendering
    return (
      <code {...rest} className={className}>
        {children}
      </code>
    )
  },
  a(props) {
    const { href, children, ...rest } = props

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault()
      if (href) {
        // 使用统一的 IPC Invoker 在外部浏览器打开链接
        invokeOpenExternal(href)
      }
    }

    return (
      <a {...rest} href={href} onClick={handleClick} className="cursor-pointer">
        {children}
      </a>
    )
  }
}

const ChatMessageComponent: React.FC<ChatMessageComponentProps> = memo(({ index, message: m, isLatest }) => {

  // Use Zustand selector to avoid unnecessary re-renders
  // Only subscribe to showLoadingIndicator, not the entire store
  const showLoadingIndicator = useChatStore(state => state.showLoadingIndicator)
  const { theme } = useTheme()

  // Ensure animation plays fully for new messages even if isLatest becomes false quickly
  const [wasLatestOnMount] = useState(isLatest)

  const [userMessageOperationIdx, setUserMessageOperationIdx] = useState<number>(-1)
  const [assistantMessageHovered, setAssistantMessageHovered] = useState<boolean>(false)

  // Determine if dark mode is active
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // Use segment typewriter for assistant messages
  const enabled = m.role === 'assistant' && isLatest && !m.typewriterCompleted
  const isStreaming = showLoadingIndicator && isLatest // Consider it streaming if globally loading and this is the latest message

  // 更新 ChatMessage - 强制 segments 字段（破坏性变更）
  // 临时：强制 ensure segments 存在
  const segments = m.segments || []

  const setMessages = useChatStore(state => state.setMessages)
  const messages = useChatStore(state => state.messages)

  const {
    getSegmentVisibleLength,
    shouldRenderSegment,
    isAllComplete
  } = useSegmentTypewriter(segments, {
    minSpeed: 5,
    maxSpeed: 20,
    enabled,
    isStreaming,
    onAllComplete: () => {
      // 打字机效果完成后，标记当前消息的 typewriterCompleted 为 true
      // 直接修改当前消息对象，避免从 store 重新获取
      if (!m.typewriterCompleted) {
        const updatedMessages = messages.map((msg, idx) => {
          if (idx === index) {
            return {
              ...msg,
              body: {
                ...msg.body,
                typewriterCompleted: true
              }
            }
          }
          return msg
        })
        setMessages(updatedMessages)
      }
    }
  })

  const onCopyClick = (content: string) => {
    if (content) {
      navigator.clipboard.writeText(content)
      toast.success('Copied', { duration: 800 })
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
      <div
        id='usr-message'
        onMouseEnter={_ => onMouseHoverUsrMsg(index)}
        onMouseLeave={_ => onMouseHoverUsrMsg(-1)}
        className={cn("flex flex-col items-end mr-1", index === 0 ? 'mt-2' : '')}
      >
        <div
          id="usr-msg-content"
          className={cn(
            "max-w-[85%] rounded-xl py-3 px-3 bg-slate-100 dark:bg-gray-800",
            wasLatestOnMount && "animate-shine animate-message-in"
          )}
        >
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
                        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
                        rehypePlugins={[rehypeKatex]}
                        // rehypePlugins={[rehypeRaw]} // 把原本会被当作纯文本的 HTML 片段，重新解析成真正的 HTML 节点
                        skipHtml={false}
                        className={cn("prose prose-code:text-gray-400 text-sm text-blue-gray-600 font-medium max-w-[100%] dark:text-white transition-all duration-400 ease-in-out")}
                        components={markdownCodeComponent}
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
              remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
              rehypePlugins={[rehypeKatex]}
              // rehypePlugins={[rehypeRaw]} // 把原本会被当作纯文本的 HTML 片段，重新解析成真正的 HTML 节点
              skipHtml={false}
              className={cn("prose prose-code:text-gray-400 text-sm text-blue-gray-600 dark:text-gray-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out")}
              components={markdownCodeComponent}
            >
              {m.content as string}
            </ReactMarkdown>
          )}
        </div>
        <div
          id="usr-msg-operation"
          className={cn(
            "mt-0.5 pr-2 space-x-1 flex text-gray-400 dark:text-gray-500 min-h-[1.5rem] transition-opacity duration-200",
            userMessageOperationIdx === index ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div className="hover:bg-gray-200 dark:hover:bg-gray-700 w-6 h-6 p-1 rounded-full flex justify-center items-center">
            <CopyIcon onClick={_ => onCopyClick(m.content as string)}></CopyIcon>
          </div>
          <div className="hover:bg-gray-200 dark:hover:bg-gray-700 w-6 h-6 p-1 rounded-full flex justify-center items-center">
            <Pencil2Icon></Pencil2Icon>
          </div>
        </div>
      </div>
    ) : null
  }

  return (m) ? (
    <div
      id='assistant-message'
      onMouseEnter={_ => onMouseHoverAssistantMsg(true)}
      onMouseLeave={_ => onMouseHoverAssistantMsg(false)}
      className={cn(
        "flex justify-start flex-col",
        index === 0 ? 'mt-2' : '',
        isLatest && "animate-assistant-message-in"
      )}
    >
      <div className="overflow-y-scroll">
        {m.model && (
          <Badge id='model-badge' variant="outline" className={cn('select-none text-gray-700 dark:text-gray-300 mb-1 dark:border-white/20', showLoadingIndicator && isLatest ? 'animate-shine-infinite' : '')}>@{m.model}</Badge>
        )}

        {segments.map((segment, segIdx) => {
          // Check if we should render this segment at all
          if (!shouldRenderSegment(segIdx)) {
            return null
          }

          if (segment.type === 'text') {
            const visibleLen = getSegmentVisibleLength(segIdx)
            const displayedText = segment.content.slice(0, visibleLen)

            // console.log(`[Render] Seg ${segIdx}: visibleLen=${visibleLen}, contentLen=${segment.content.length}, active=${activeTextIndex}`)

            // If empty, render nothing
            if (!displayedText) return null

            return (
              <ReactMarkdown
                key={`text-${segIdx}`}
                remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
                skipHtml={false}
                remarkRehypeOptions={{ passThrough: ['link'] }}
                className="prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out"
                components={markdownCodeComponent}
              >
                {displayedText}
              </ReactMarkdown>
            )
          } else if (segment.type === 'reasoning') {
            return (
              <Accordion key={`reasoning-${segIdx}`} type="single" collapsible className='pl-0.5 pr-0.5 rounded-xl'>
                <AccordionItem value={`reasoning-${segIdx}`}>
                  <AccordionTrigger className='py-2'>
                    <div className='flex items-center gap-2'>
                      <BrainCircuit className='w-4 h-4 text-gray-500 dark:text-gray-400' />
                      <span className='text-xs text-gray-500 dark:text-gray-400 font-medium'>Reasoning</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className='prose px-2 py-1 text-xs text-gray-500 dark:text-gray-400 italic'>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        skipHtml={false}
                        className="prose px-0.5 py-0.5 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-4 prose-hr:mb-4 prose-code:text-gray-400 dark:prose-code:text-gray-100 dark:text-slate-300 transition-all duration-400 ease-in-out"
                      >
                        {segment.content}
                      </ReactMarkdown>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )
          } else if (segment.type === 'toolCall') {
            return (
              <ToolCallResult
                key={`tool-${segIdx}`}
                toolCall={segment}
                index={index}
                isDarkMode={isDarkMode}
              />
            )
          }
          return null
        })}
      </div>
      <div
        id="assistant-message-operation"
        className={cn(
          "mt-0.5 pl-2 space-x-1 flex text-gray-500 dark:text-gray-400 min-h-[1.5rem] transition-opacity duration-200",
          assistantMessageHovered ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="hover:bg-gray-200 dark:hover:bg-gray-700 w-6 h-6 p-1 rounded-full flex justify-center items-center">
          <CopyIcon onClick={_ => onCopyClick(m.content as string)}></CopyIcon>
        </div>
        {isLatest && (
          <div className="hover:bg-gray-200 dark:hover:bg-gray-700 w-6 h-6 p-1 rounded-full flex justify-center items-center">
            <ReloadIcon></ReloadIcon>
          </div>
        )}
        <div className="hover:bg-gray-200 dark:hover:bg-gray-700 w-6 h-6 p-1 rounded-full flex justify-center items-center">
          <Pencil2Icon></Pencil2Icon>
        </div>
      </div>
    </div>
  ) : null
})

export default ChatMessageComponent