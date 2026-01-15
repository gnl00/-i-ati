import { CodeWrapper } from '@renderer/components/markdown/SyntaxHighlighterWrapper'
import { invokeOpenExternal } from '@renderer/invoker/ipcInvoker'
import React from 'react'

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
  const commonLanguages = [
    'bash', 'sh', 'shell', 'zsh', 'fish',
    'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx',
    'python', 'py', 'python3',
    'java', 'c', 'cpp', 'c\\+\\+', 'csharp', 'cs',
    'go', 'golang', 'rust', 'ruby', 'rb', 'php',
    'swift', 'kotlin', 'scala', 'dart',
    'html', 'css', 'scss', 'sass', 'less',
    'json', 'xml', 'yaml', 'yml', 'toml',
    'sql', 'mysql', 'postgresql', 'sqlite', 'sqlite3', 'graphql',
    'markdown', 'md', 'plaintext', 'text', 'txt',
    'dockerfile', 'docker', 'makefile', 'cmake'
  ]

  const languagePattern = `(${commonLanguages.join('|')})`
  // Match: ```language followed by whitespace and everything until newline
  // Captures all content after language (including metadata like ".message")
  const concatenatedPattern = new RegExp(`\`\`\`${languagePattern}\\s+([^\\n]+)`, 'gi')

  fixed = fixed.replace(concatenatedPattern, (match, language, restOfLine) => {
    return '```' + language.toLowerCase() + '\n' + restOfLine
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
    const { children, className, node, ...rest } = props
    const match = /language-(\w+)/.exec(className || '')

    // Convert children to string for analysis
    const textContent = String(children || '')

    // Check if this is a code block (contains newlines) or inline code
    const isCodeBlock = textContent.includes('\n') || className?.startsWith('language-')

    // Exclude 'language-math' - let rehypeKatex handle it
    if (match && match[1] !== 'math') {
      // Handle empty or undefined children
      const codeContent = textContent.trim()

      // If code content is empty, show a placeholder or fallback
      if (!codeContent) {
        return (
          <CodeWrapper
            children="// Empty code block"
            language={match[1]}
          />
        )
      }

      return (
        <CodeWrapper
          children={codeContent.replace(/\n$/, '')}
          language={match[1]}
        />
      )
    }

    // Handle code blocks without language specifier (like file structures)
    if (isCodeBlock && !match) {
      const codeContent = textContent.trim()

      return (
        <CodeWrapper
          children={codeContent || '// Empty code block'}
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
