import React, { useState, useEffect } from 'react'
import { cn } from '@renderer/lib/utils'

interface WelcomeMessage5Props {
  className?: string
  onStart?: () => void
}

const WelcomeMessage5: React.FC<WelcomeMessage5Props> = ({ className, onStart }) => {
  const [typedText, setTypedText] = useState('')
  const fullText = "How can I help you today?"

  const hints = [
    "💬 Ask me anything",
    "📄 Upload a document to analyze",
    "💡 Brainstorm ideas together",
    "✍️ Help me write",
    "🔍 Analyze and explain",
    "🎨 Creative thinking",
    "🌍 Translate text",
    "🧮 Solve problems"
  ]
  const [currentHint, setCurrentHint] = useState(0)

  useEffect(() => {
    let i = 0
    const typeInterval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i))
        i++
      } else {
        clearInterval(typeInterval)
      }
    }, 60)

    return () => clearInterval(typeInterval)
  }, [])

  useEffect(() => {
    const hintInterval = setInterval(() => {
      setCurrentHint(prev => (prev + 1) % hints.length)
    }, 3000)
    return () => clearInterval(hintInterval)
  }, [])

  return (
    <div className={cn(
      "relative w-full h-[70vh] flex items-center justify-center",
      className
    )}>
      {/* Subtle background texture */}
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]">
        <div className="w-full h-full" style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-3xl px-8">
        <div className="flex flex-col items-center justify-center space-y-16">

          {/* Title with typewriter effect */}
          <div className="text-center space-y-6 animate-fade-in">
            <h1 className="text-5xl md:text-6xl font-light text-slate-800 dark:text-slate-100 tracking-tight">
              <span className="inline-block min-h-[1.2em]">
                {typedText}
                <span className="animate-pulse">|</span>
              </span>
            </h1>
          </div>

          {/* Subtitle */}
          <p className="text-center text-lg text-slate-500 dark:text-slate-400 font-light max-w-xl animate-fade-in-delayed">
            Ask me a question or share what you're working on.
          </p>

          {/* CTA Button */}
          <div className="animate-slide-up">
            <button
              onClick={onStart}
              className="group relative px-12 py-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-full font-medium text-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            >
              <span className="relative flex items-center gap-3">
                <svg
                  className="w-5 h-5 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                Start a conversation
              </span>
            </button>
          </div>

          {/* Helpful hints */}
          <div className="animate-fade-in-delayed-2 pt-8">
            <p className="text-center text-sm text-slate-400 dark:text-slate-500 font-light">
              <span className="inline-block transition-opacity duration-500">
                {hints[currentHint]}
              </span>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-delayed {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-delayed-2 {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-fade-in-delayed {
          animation: fade-in-delayed 0.6s ease-out 0.2s both;
        }

        .animate-slide-up {
          animation: slide-up 0.6s ease-out 0.4s both;
        }

        .animate-fade-in-delayed-2 {
          animation: fade-in-delayed-2 0.6s ease-out 0.6s both;
        }

        .animate-pulse {
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

export default WelcomeMessage5
