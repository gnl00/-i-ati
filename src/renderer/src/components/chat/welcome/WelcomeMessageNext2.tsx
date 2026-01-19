import React, { useState, useEffect } from 'react'
import { cn } from '@renderer/lib/utils'
import { useAssistantStore } from '@renderer/store/assistant'
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
interface WelcomeMessageProps {
  className?: string
  onAssistantClick?: (assistant: Assistant) => void
  isExiting?: boolean
}

// ============================================================================
// Main Component
// ============================================================================
const WelcomeMessage: React.FC<WelcomeMessageProps> = ({
  className,
  onAssistantClick,
  isExiting = false
}) => {
  // Store
  const { assistants, loadAssistants, isLoading } = useAssistantStore()

  // Text State
  const [typedText, setTypedText] = useState('')
  const fullText = "How can I help you today?"

  // Load assistants on mount
  useEffect(() => {
    loadAssistants()
  }, [])

  // Typewriter Effect
  useEffect(() => {
    if (isExiting) {
      return
    }
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
  }, [fullText, isExiting])

  const handleAssistantClick = (assistant: Assistant) => {
    onAssistantClick?.(assistant)
  }

  // Render
  return (
    <div
      className={cn(
        "welcome-message relative w-full h-[70vh] flex items-center justify-center",
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

          {/* Assistant Cards */}
          <div className="w-full animate-slide-up">
            {isLoading ? (
              <div className="text-center text-muted-foreground">
                Loading assistants...
              </div>
            ) : assistants.length === 0 ? (
              <div className="text-center text-muted-foreground">
                No assistants available
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assistants.map((assistant) => (
                  <button
                    key={assistant.id}
                    onClick={() => handleAssistantClick(assistant)}
                    className="group text-left p-6 rounded-2xl border border-border bg-card hover:bg-accent/50 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-4">
                      <span className="text-2xl group-hover:scale-110 transition-transform duration-300">
                        {assistant.icon || '🤖'}
                      </span>
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground mb-1">
                          {assistant.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {assistant.description || 'No description'}
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
            )}
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
