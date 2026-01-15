import { CodeWrapper } from '@renderer/components/markdown/SyntaxHighlighterWrapper'
import { invokeOpenExternal } from '@renderer/invoker/ipcInvoker'
import React from 'react'

const COMMON_LANGUAGES = [
  'bash', 'sh', 'shell', 'zsh', 'fish',
  'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx',
  'python', 'py', 'python3',
  'java', 'c', 'cpp', 'c\\+\\+', 'c#', 'csharp', 'cs',
  'go', 'golang', 'rust', 'ruby', 'rb', 'php',
  'swift', 'kotlin', 'scala', 'dart',
  'html', 'css', 'scss', 'sass', 'less',
  'json', 'xml', 'yaml', 'yml', 'toml',
  'sql', 'mysql', 'postgresql', 'sqlite', 'sqlite3', 'graphql',
  'markdown', 'md', 'plaintext', 'text', 'txt',
  'dockerfile', 'docker', 'makefile', 'cmake'
]

const LANGUAGE_PATTERN = `(${COMMON_LANGUAGES.join('|')})`

// Match: ```language + (optional whitespace) + code on the same line (no newline yet)
// Examples:
// - ```bashecho 'test'
// - ```css .message {
const CONCATENATED_FENCE_PATTERN = new RegExp(`\`\`\`${LANGUAGE_PATTERN}(?:\\s+)?(?=\\S)([^\\n\\r]+)`, 'gi')

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

  // Second pass: Fix code blocks where language and code are concatenated (with or without space)
  // Example 1: ```bashecho 'test' -> ```bash\necho 'test'
  // Example 2: ```css .message { -> ```css\n.message {
  fixed = fixed.replace(CONCATENATED_FENCE_PATTERN, (_match, language, restOfLine) => {
    return '```' + normalizeLanguage(language) + '\n' + String(restOfLine).trimStart()
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
