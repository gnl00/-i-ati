import { SpeedCodeHighlight } from '@renderer/components/chat/common/SpeedCodeHighlight'
import { invokeOpenExternal } from '@renderer/invoker/ipcInvoker'
import { CopyIcon } from '@radix-ui/react-icons'
import React from 'react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

function normalizeLanguage(lang: string) {
  const lower = lang.toLowerCase()
  if (lower === 'c++') return 'cpp'
  if (lower === 'c#') return 'csharp'
  if (lower === 'typescript') return 'ts'
  if (lower === 'javascript') return 'js'
  return lower
}

function childrenToText(children: any) {
  if (Array.isArray(children)) return children.join('')
  return String(children ?? '')
}

/**
 * Fix malformed code blocks where language identifier is concatenated with code content.
 * Example: ```bashecho 'test' -> ```bash\necho 'test'
 */
export function fixMalformedCodeBlocks(markdown: string): string {
  // First pass: Fix ``` that's not on its own line (preceded by non-whitespace)
  // Example: "text```\ncode" -> "text\n```\ncode"
  let fixed = markdown.replace(/([^\s\n])```/g, '$1\n```')

  // Second pass: Fix fenced code blocks where language and code are on the same line.
  // Examples:
  // - ```bashecho 'test' -> ```bash\necho 'test'
  // - ```css .message { -> ```css\n.message {
  fixed = fixed.replace(/(^|\n)```([^\n\r]*)/g, (match, prefix, info) => {
    const rawLine = String(info ?? '')
    const trimmed = rawLine.trim()
    if (!trimmed) return match
    const firstTokenMatch = trimmed.match(/^(\S+)([\s\S]*)$/)
    if (!firstTokenMatch) return match
    const lang = firstTokenMatch[1]
    const rest = firstTokenMatch[2] ?? ''
    if (!rest.trim()) return match
    return prefix + '```' + normalizeLanguage(lang) + '\n' + rest.replace(/^\s+/, '')
  })

  return fixed
}

/**
 * Shared markdown components for both user and assistant messages.
 * Handles code blocks with syntax highlighting, inline code, and link interception.
 */
export const markdownCodeComponents = {
  pre(props: any) {
    const { children } = props
    // Remove pre styling - let CodeWrapper handle all styling
    return <div className="not-prose">{children}</div>
  },

  code(props: any) {
    const { children, className, inline, node, ...rest } = props
    const langMatch = /language-([a-zA-Z0-9_+-]+)/.exec(className || '')
    const language = langMatch?.[1]

    const textContent = childrenToText(children)

    // Prefer `inline` when available; fall back to content heuristics.
    const isInline = typeof inline === 'boolean' ? inline : !textContent.includes('\n')
    const isCodeBlock = !isInline

    // Exclude 'language-math' - let rehypeKatex handle it
    if (language && language !== 'math') {
      // Keep whitespace; only strip a single trailing newline that react-markdown often adds.
      const codeContent = textContent.replace(/\n$/, '')

      // If code content is empty, show a placeholder or fallback
      if (!codeContent.trim()) {
        return (
          <SpeedCodeBlock
            code="// Empty code block"
            language={normalizeLanguage(language)}
            themeOverride="atom-dark"
          />
        )
      }

      return (
        <SpeedCodeBlock
          code={codeContent}
          language={normalizeLanguage(language)}
          themeOverride="atom-dark"
        />
      )
    }

    // Handle code blocks without language specifier (like file structures)
    if (isCodeBlock && !language) {
      const codeContent = textContent.replace(/\n$/, '')

      return (
        <SpeedCodeBlock
          code={codeContent.trim() ? codeContent : '// Empty code block'}
          language="plaintext"
          themeOverride="atom-dark"
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

  a(props: any) {
    const { href, children, ...rest } = props

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault()
      if (href) {
        // Use unified IPC Invoker to open links in external browser
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

const SpeedCodeBlock: React.FC<{
  code: string
  language: string
  themeOverride?: 'atom-dark' | 'default'
  containerClassName?: string
}> = React.memo(({ code, language, themeOverride, containerClassName }) => {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(String(code))
      toast.success('Copied')
    } catch (err) {
      toast.error('Copy failed')
    }
  }

  return (
    <div
      className={cn(
        "not-prose rounded-lg overflow-hidden shadow-xs bg-[#1e1e1e] text-slate-100 border border-slate-200/60 dark:bg-[#0f1115] dark:text-slate-100 dark:border-slate-700/50",
        containerClassName
      )}
    >
      <div className="flex justify-between items-center bg-[#141414] dark:bg-[#0f1115] px-2 py-0.5 border-b border-white/5">
        <span className="px-2 py-0.5 text-xs font-mono font-semibold text-slate-200 select-none tracking-wide bg-white/5 rounded-md">
          {language}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={copyToClipboard}
            className="h-7 px-2 hover:bg-white/10 rounded-md transition-all duration-200"
          >
            <CopyIcon className="w-3.5 h-3.5 text-slate-300" />
          </Button>
        </div>
      </div>
      <SpeedCodeHighlight
        code={code}
        language={language}
        themeOverride={themeOverride}
        backgroundColor="#1e1e1e"
        hideLineNumbers={false}
      />
    </div>
  )
})

SpeedCodeBlock.displayName = 'SpeedCodeBlock'
