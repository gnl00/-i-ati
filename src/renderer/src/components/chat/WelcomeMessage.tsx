import { cn } from '@renderer/lib/utils'
import React, { useEffect, useState } from 'react'

interface WelcomeMessageProps {
  className?: string
}

const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ className }) => {
  const [displayedText, setDisplayedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const fullText = `Hi there! 👋

I'm your AI assistant, ready to help with anything you need.

What would you like to explore today?`

  useEffect(() => {
    if (currentIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + fullText[currentIndex])
        setCurrentIndex(prev => prev + 1)
      }, 30) // 打字速度：30ms per character

      return () => clearTimeout(timeout)
    } else {
      setIsComplete(true)
    }
  }, [currentIndex, fullText])

  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full w-full px-8 py-16",
      className
    )}>
      <div className="max-w-2xl w-full space-y-8">
        {/* Welcome Text with Typewriter Effect */}
        <div className="relative">
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

        {/* Feature Pills */}
        {isComplete && (
          <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            <div className="flex flex-wrap gap-3 justify-center select-none">
              <div className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm">
                💻 Coding Help
              </div>
              <div className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm">
                ✨ Creative Writing
              </div>
              <div className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm">
                🧠 Problem Solving
              </div>
              <div className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm">
                💬 Conversation
              </div>
            </div>

            {/* Subtle Hint */}
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500 select-none">
              <span>Type below to get started</span>
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
        )}
      </div>
    </div>
  )
}

export default WelcomeMessage
