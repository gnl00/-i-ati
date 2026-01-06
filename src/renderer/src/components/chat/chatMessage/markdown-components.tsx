import { CodeWrapper } from '@renderer/components/markdown/SyntaxHighlighterWrapper'
import { invokeOpenExternal } from '@renderer/invoker/ipcInvoker'
import React from 'react'

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
