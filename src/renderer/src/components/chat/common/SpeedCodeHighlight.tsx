import { highlightElement } from '@speed-highlight/core'
import React, { useEffect, useRef } from 'react'
import { loadSpeedHighlightTheme } from '@renderer/utils/styleLoaders'

interface SpeedCodeHighlightProps {
  code: string
  language?: string
  className?: string
}

/**
 * A lightweight code highlighting component using speed-highlight
 *
 * Benefits over react-syntax-highlighter:
 * - Much smaller bundle size (~2kB core + ~1kB per language vs hundreds of kB)
 * - Faster rendering (doesn't block main thread)
 * - Better performance with multiple code blocks
 */
export const SpeedCodeHighlight: React.FC<SpeedCodeHighlightProps> = React.memo(({
  code,
  language = 'json',
  className = ''
}) => {
  const codeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = codeRef.current
    if (!element) return

    // Set the text content first (show plain text immediately)
    element.textContent = code

    // Delay syntax highlighting to allow accordion animation to complete smoothly
    // This prevents the highlighting from blocking the accordion's expand animation
    const timeoutId = setTimeout(() => {
      try {
        void loadSpeedHighlightTheme()
        highlightElement(element, language as any)
      } catch (error) {
        console.warn('Failed to highlight code:', error)
      }
    }, 50) // Wait for accordion animation to complete (~300ms) + small buffer

    return () => clearTimeout(timeoutId)
  }, [code, language])

  return (
    <div
      ref={codeRef}
      className={`shj-lang-${language} ${className}`}
      style={{
        margin: 0,
        padding: '1rem',
        fontSize: '0.75rem',
        lineHeight: '1.5',
        background: 'transparent',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'monospace',
        overflow: 'auto',
      }}
    />
  )
})

SpeedCodeHighlight.displayName = 'SpeedCodeHighlight'
