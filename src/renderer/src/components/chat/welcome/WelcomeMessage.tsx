import { cn } from '@renderer/lib/utils'
import React, { useEffect, useState } from 'react'

interface WelcomeMessageProps {
  className?: string
  onSuggestionClick?: (suggestion: string) => void
}

const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ className, onSuggestionClick }) => {
  const [displayedText, setDisplayedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const fullText = `Hi there! 👋

I'm your AI assistant, ready to help with anything you need.

What would you like to explore today?`

  const suggestions = [
    {
      icon: '💻',
      title: 'Help me code',
      description: 'Debug, explain, or write code'
    },
    {
      icon: '✨',
      title: 'Creative writing',
      description: 'Stories, essays, or content ideas'
    },
    {
      icon: '🧠',
      title: 'Problem solving',
      description: 'Analyze and solve complex problems'
    },
    {
      icon: '💡',
      title: 'Brainstorm ideas',
      description: 'Generate and explore new concepts'
    }
  ]

  useEffect(() => {
    if (currentIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + fullText[currentIndex])
        setCurrentIndex(prev => prev + 1)
      }, 30)

      return () => clearTimeout(timeout)
    } else {
      setIsComplete(true)
    }
  }, [currentIndex, fullText])

  const handleSuggestionClick = (suggestion: { icon: string; title: string; description: string }) => {
    const prompt = `Help me with ${suggestion.title.toLowerCase()}`
    onSuggestionClick?.(prompt)
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full w-full px-8 py-16",
      className
    )}>
      <div className="max-w-3xl w-full space-y-12">
        {/* Welcome Text with Typewriter Effect */}
        <div className="relative text-center">
          <div className={cn(
            "text-3xl font-light text-gray-700 dark:text-gray-300 whitespace-pre-wrap",
            "leading-relaxed tracking-wide"
          )}>
            {displayedText}
            {!isComplete && (
              <span className="inline-block w-[3px] h-7 bg-gray-400 dark:bg-gray-500 ml-1 animate-pulse" />
            )}
          </div>
        </div>

        {/* Suggestion Cards */}
        <div className={cn(
          "grid grid-cols-1 md:grid-cols-2 gap-4 transition-all duration-700 delay-100",
          isComplete ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}>
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="group text-left p-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-4">
                <span className="text-2xl group-hover:scale-110 transition-transform duration-300">
                  {suggestion.icon}
                </span>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {suggestion.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {suggestion.description}
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-x-2 group-hover:translate-x-0"
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

        {/* Subtle Hint */}
        <div className={cn(
          "flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-500 select-none transition-all duration-700",
          isComplete ? "opacity-100" : "opacity-0"
        )}>
          <span>Or type your own question below</span>
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default WelcomeMessage
