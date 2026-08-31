import { SpeedCodeHighlight } from '@renderer/features/chat/common/SpeedCodeHighlight'
import { invokeOpenExternal } from '@renderer/infrastructure/ipc'
import { CheckIcon, CopyIcon } from '@radix-ui/react-icons'
import React from 'react'
import { toast } from 'sonner'
import { Button } from '@renderer/shared/components/ui/button'
import { useCopyFeedback } from '@renderer/shared/hooks/useCopyFeedback'
import { cn } from '@renderer/shared/lib/utils'
import { normalizeLanguage } from './markdown-normalization'

export { fixMalformedCodeBlocks } from './markdown-normalization'

function childrenToText(children: any) {
  if (Array.isArray(children)) return children.join('')
  return String(children ?? '')
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
      <code {...rest} className={cn(className, isInline && 'wrap-anywhere')}>
        {children}
      </code>
    )
  },

  table(props: any) {
    const { children, node, ...rest } = props

    return (
      <div className="w-full max-w-full overflow-x-auto">
        <table {...rest}>{children}</table>
      </div>
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

const codeBlockBackground = '#1e1e1e'

const SpeedCodeBlock: React.FC<{
  code: string
  language: string
  themeOverride?: 'atom-dark' | 'default'
  containerClassName?: string
}> = React.memo(({ code, language, themeOverride, containerClassName }) => {
  const { copied, successCount, triggerCopy } = useCopyFeedback(
    () => navigator.clipboard.writeText(String(code)),
    { resetKey: code, onError: () => toast.error('Copy failed') }
  )
  const copyLabel = copied ? 'Copied' : 'Copy code'

  return (
    <div
      className={cn(
        "not-prose rounded-lg overflow-hidden shadow-xs bg-[#1e1e1e] text-slate-100 border border-slate-200/60 dark:text-slate-100 dark:border-slate-700/50",
        containerClassName
      )}
    >
      <div
        className="flex justify-between items-center px-2 py-0.5 border-b border-white/[0.03]"
        style={{ backgroundColor: codeBlockBackground }}
      >
        <span className="px-2 py-0.5 text-xs font-mono font-semibold text-slate-300 select-none tracking-wide bg-white/[0.04] rounded-md">
          {language}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(): void => {
              void triggerCopy()
            }}
            aria-label={copyLabel}
            title={copyLabel}
            className="h-7 rounded-md px-2 transition-[color,background-color,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/[0.08] active:scale-[0.97] motion-reduce:transition-colors motion-reduce:duration-0 motion-reduce:active:scale-none"
          >
            <span
              data-testid="code-copy-icon-slot"
              className="relative block h-3.5 w-3.5 shrink-0"
            >
              <CopyIcon
                aria-hidden="true"
                data-testid="code-copy-icon"
                className={cn(
                  'absolute inset-0 h-full w-full text-slate-400 transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                  copied ? 'scale-[0.92] opacity-0' : 'scale-100 opacity-100'
                )}
              />
              <CheckIcon
                aria-hidden="true"
                data-testid="code-copy-success-icon"
                className={cn(
                  'absolute inset-0 h-full w-full text-emerald-400 transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                  copied ? 'scale-100 opacity-100' : 'scale-[0.92] opacity-0'
                )}
              />
            </span>
          </Button>
          <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {copied ? <span key={successCount}>Copied</span> : ''}
          </span>
        </div>
      </div>
      <SpeedCodeHighlight
        code={code}
        language={language}
        themeOverride={themeOverride}
        backgroundColor={codeBlockBackground}
        hideLineNumbers={false}
      />
    </div>
  )
})

SpeedCodeBlock.displayName = 'SpeedCodeBlock'
