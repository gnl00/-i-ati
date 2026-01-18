import React, { useState, useEffect } from 'react'
import { cn } from '@renderer/lib/utils'
import './WelcomeMessage.css'

// ============================================================================
// Constants
// ============================================================================
const CONFIG = {
  TYPEWRITER_SPEED: 60,
} as const

// ============================================================================
// Types
// ============================================================================
interface Suggestion {
  icon: string
  title: string
  description: string
  prompt: string
}

interface WelcomeMessageProps {
  className?: string
  onSuggestionClick?: (suggestion: Suggestion) => void
  isExiting?: boolean
}

// ============================================================================
// Main Component
// ============================================================================
const WelcomeMessage: React.FC<WelcomeMessageProps> = ({
  className,
  onSuggestionClick,
  isExiting = false
}) => {
  // Text State
  const [typedText, setTypedText] = useState('')
  const fullText = "How can I help you today?"

  const suggestions: Suggestion[] = [
    {
      icon: '💻',
      title: 'Help me code',
      description: 'Debug, explain, or write code',
      prompt: 'Help me with coding. I need assistance with debugging, understanding code, or writing new code.'
    },
    {
      icon: '✨',
      title: 'Creative writing',
      description: 'Stories, essays, or content ideas',
      prompt: 'Help me with creative writing. I\'m looking for ideas for stories, essays, or other content.'
    },
    {
      icon: '🧠',
      title: 'Problem solving',
      description: 'Analyze and solve complex problems',
      prompt: 'Help me solve this problem. I need to analyze and find a solution.'
    },
    {
      icon: '💡',
      title: 'Brainstorm ideas',
      description: 'Generate and explore new concepts',
      prompt: 'Help me brainstorm ideas. I want to explore new concepts and possibilities.'
    }
  ]

  // Typewriter Effect
  useEffect(() => {
    let i = 0
    const typeInterval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i))
        i++
      } else {
        clearInterval(typeInterval)
      }
    }, CONFIG.TYPEWRITER_SPEED)

    return () => clearInterval(typeInterval)
  }, [])

  const handleSuggestionClick = (suggestion: Suggestion) => {
    onSuggestionClick?.(suggestion)
  }

  // Render
  return (
    <div
      className={cn(
        "relative w-full h-[70vh] flex items-center justify-center",
        isExiting && "animate-exit",
        className
      )}
    >
      {/* Main Content */}
      <div className="relative z-10 w-full max-w-3xl px-8">
        <div className="flex flex-col items-center justify-center space-y-12">
          <div className="text-center space-y-6 animate-fade-in">
            <h1 className="text-5xl md:text-6xl font-light text-foreground tracking-tight">
              <span className="inline-block min-h-[1.2em]">
                {typedText}
                <span className="animate-pulse">|</span>
              </span>
            </h1>
          </div>

          <p className="text-center text-lg text-muted-foreground font-light max-w-xl animate-fade-in-delayed">
            Ask me a question or share what you're working on.
          </p>

          {/* Suggestion Cards */}
          <div className="w-full animate-slide-up">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="group text-left p-6 rounded-2xl border border-border bg-card hover:bg-accent/50 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="flex items-start gap-4">
                    <span className="text-2xl group-hover:scale-110 transition-transform duration-300">
                      {suggestion.icon}
                    </span>
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground mb-1">
                        {suggestion.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {suggestion.description}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5 text-muted-foreground group-hover:text-foreground opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-x-2 group-hover:translate-x-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="animate-fade-in-delayed-2 pt-4">
            <p className="text-center text-sm text-muted-foreground font-light">
              Or type your own question below
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WelcomeMessage
