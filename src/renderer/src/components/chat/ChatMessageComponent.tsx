import { CopyIcon, Pencil2Icon, ReloadIcon } from '@radix-ui/react-icons'
import { CodeWrapper } from '@renderer/components/markdown/SyntaxHighlighterWrapper'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@renderer/components/ui/accordion"
import { Badge } from "@renderer/components/ui/badge"
import { cn } from '@renderer/lib/utils'
import { BadgePercent } from 'lucide-react'
import React, { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { toast } from 'sonner'

import { useTheme } from '@renderer/components/theme-provider'
import { updateMessage } from '@renderer/db/MessageRepository'
import { useTypewriter } from '@renderer/hooks/useTypewriter'
import { useChatStore } from '../../store'
import { ToolCallResult } from './ToolCallResult'

interface ChatMessageComponentProps {
  index: number
  message: ChatMessage
  isLatest: boolean
  onTypingChange?: () => void
}

// Shared markdown code components for both user and assistant messages
const markdownCodeComponent = {
  pre(props) {
    const { children, ...rest } = props
    return <>{children}</>
  },
  code(props) {
    const { children, className, node, ...rest } = props
    const match = /language-(\w+)/.exec(className || '')

    // Exclude 'language-math' - let rehypeKatex handle it
    if (match && match[1] !== 'math') {
      return (
        <CodeWrapper
          children={String(children).replace(/\n$/, '')}
          language={match[1]}
        />
      )
    }

    // For math or inline code, use default rendering
    return (
      <code {...rest} className={className}>
        {children}
      </code>
    )
  }
}

const ChatMessageComponent: React.FC<ChatMessageComponentProps> = memo(({ index, message: m, isLatest, onTypingChange }) => {

  const { showLoadingIndicator } = useChatStore()
  const { theme } = useTheme()

  const [userMessageOperationIdx, setUserMessageOperationIdx] = useState<number>(-1)
  const [assistantMessageHovered, setAssistantMessageHovered] = useState<boolean>(false)

  // Determine if dark mode is active
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // 处理打字机完成回调 - 直接在组件内部更新 store 和 IndexedDB
  const handleTypewriterComplete = React.useCallback(async () => {
    const { setMessages, messages } = useChatStore.getState()

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

    // 持久化到 IndexedDB
    const messageToUpdate = updatedMessages[index]
    if (messageToUpdate?.id) {
      try {
        await updateMessage(messageToUpdate)
      } catch (error) {
        console.error('Failed to update message in IndexedDB:', error)
      }
    }
  }, [index])

  // Apply typewriter effect only to assistant messages
  // 如果消息已经完成打字机效果（typewriterCompleted = true），直接显示完整内容
  // 否则，只对最新消息应用打字机效果
  const shouldAnimate = m.role === 'assistant' && isLatest && !m.typewriterCompleted

  const assistantContent = useTypewriter(
    m.role === 'assistant' && m.content ? (m.content as string) : '',
    {
      minSpeed: 5,
      maxSpeed: 20,
      enabled: shouldAnimate,
      onTyping: onTypingChange,
      onComplete: handleTypewriterComplete
    }
  )

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
            isLatest && "animate-shine animate-message-in"
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
      <div className="rounded-xl dark:bg-gray-900 overflow-y-scroll">
        {m.model && (
          <Badge id='model-badge' variant="outline" className={cn('select-none text-gray-700 dark:text-gray-300 mb-1 dark:border-white/20', showLoadingIndicator && isLatest ? 'animate-shine-infinite' : '')}>@{m.model}</Badge>
        )}
        {m.reasoning && !m.artifacts && (
          <Accordion defaultValue={'reasoning-' + index} type="single" collapsible className='pl-0.5 pr-0.5 rounded-xl'>
            <AccordionItem value={'reasoning-' + index}>
              <AccordionTrigger className='text-sm h-10'>
                <Badge variant={'secondary'} className="text-gray-600 dark:text-gray-300 bg-blue-gray-100 dark:bg-gray-800 hover:bg-blue-gray-200 dark:hover:bg-gray-700 space-x-1">
                  <BadgePercent className="w-4" />
                  <span>Thinking</span>
                </Badge>
              </AccordionTrigger>
              <AccordionContent className="bg-blue-gray-100 dark:bg-gray-800 p-1 border-none rounded-xl">
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
            <ToolCallResult
              key={index + '-' + idx}
              toolCall={tc}
              index={index}
              isDarkMode={isDarkMode}
            />
          ))
        }
        {
          m.content && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
              rehypePlugins={[rehypeRaw, rehypeKatex]} // rehypeRaw 把原本会被当作纯文本的 HTML 片段，重新解析成真正的 HTML 节点
              // rehypePlugins={[rehypeKatex]}
              skipHtml={false}
              remarkRehypeOptions={{ passThrough: ['link'] }}
              className="prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out"
              components={markdownCodeComponent}
            >
              {assistantContent}
            </ReactMarkdown>
          )
        }
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