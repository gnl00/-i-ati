import { CodeWrapper } from '@renderer/components/markdown/SyntaxHighlighterWrapper'
import { invokeOpenExternal } from '@renderer/invoker/ipcInvoker'
import React from 'react'

function normalizeLanguage(lang: string) {
  const lower = lang.toLowerCase()
  if (lower === 'c++') return 'cpp'
  if (lower === 'c#') return 'csharp'
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
  fixed = fixed.replace(/```([^\n\r]*)/g, (match, info) => {
    const raw = String(info ?? '').trim()
    if (!raw) return match
    const [lang, ...rest] = raw.split(/\s+/)
    if (!lang) return match
    if (rest.length === 0) return match
    return '```' + normalizeLanguage(lang) + '\n' + rest.join(' ')
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
          <CodeWrapper
            children="// Empty code block"
            language={normalizeLanguage(language)}
          />
        )
      }

      return (
        <CodeWrapper
          children={codeContent}
          language={normalizeLanguage(language)}
        />
      )
    }

    // Handle code blocks without language specifier (like file structures)
    if (isCodeBlock && !language) {
      const codeContent = textContent.replace(/\n$/, '')

      return (
        <CodeWrapper
          children={codeContent.trim() ? codeContent : '// Empty code block'}
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
