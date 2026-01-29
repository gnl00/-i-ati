import { highlightElement } from '@speed-highlight/core'
import React, { useEffect, useRef } from 'react'
import { loadSpeedHighlightTheme } from '@renderer/utils/styleLoaders'
import { useTheme } from '@renderer/components/theme-provider'

interface SpeedCodeHighlightProps {
  code: string
  language?: string
  className?: string
  themeOverride?: 'atom-dark' | 'default' | string
  backgroundColor?: string
  hideLineNumbers?: boolean
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
  className = '',
  themeOverride,
  backgroundColor,
  hideLineNumbers = true
}) => {
  const codeRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const element = codeRef.current
    if (!element) return

    // Set the text content first (show plain text immediately)
    element.textContent = code

    // Delay syntax highlighting to allow accordion animation to complete smoothly.
    // Note: when code changes (e.g. short/full toggle), this creates a brief
    // plain-text -> highlighted flash after the timeout, which can feel like jitter.
    const timeoutId = setTimeout(() => {
      try {
        const isDarkMode =
          theme === 'dark' ||
          (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        const resolvedTheme = themeOverride === 'atom-dark' || themeOverride === 'dark'
          ? themeOverride
          : (isDarkMode ? 'dark' : 'atom-dark')
        void loadSpeedHighlightTheme(resolvedTheme)
        highlightElement(element, language as any, undefined, { hideLineNumbers })
      } catch (error) {
        console.warn('Failed to highlight code:', error)
      }
    }, 30) // Wait for accordion animation to complete (~300ms) + small buffer

    return () => clearTimeout(timeoutId)
  }, [code, language, theme, themeOverride, hideLineNumbers])

  return (
    <div
      ref={codeRef}
      className={`shj-lang-${language} ${className}`}
      style={{
        margin: 0,
        padding: '1rem',
        paddingTop: '0.5rem',
        paddingBottom: '0.75rem',
        fontSize: '0.75rem',
        lineHeight: '1.5',
        background: backgroundColor ?? 'transparent',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'monospace',
        overflow: 'auto',
      }}
    />
  )
})

SpeedCodeHighlight.displayName = 'SpeedCodeHighlight'
