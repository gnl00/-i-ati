import { cn } from '@renderer/lib/utils'
import React from 'react'

interface WelcomeMessage2Props {
  className?: string
}

const WelcomeMessage2: React.FC<WelcomeMessage2Props> = ({ className }) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full w-full px-8 py-16",
      className
    )}>
      <div className="max-w-2xl w-full flex flex-col items-center justify-center space-y-12">
        {/* Title */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-light text-gray-800 dark:text-gray-100 tracking-wide">
            How can I help?
          </h1>
        </div>

        {/* Floating + Breathing Button */}
        <div className="relative animate-float">
          <button className="relative px-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-medium text-base transition-all duration-500 hover:scale-105 active:scale-95 animate-breathing-shadow">
            <span className="flex items-center gap-3">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Start Conversation
            </span>
          </button>
        </div>

        {/* Subtle hint */}
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 select-none">
          <span>Type your message below</span>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes breathing-shadow {
          0%, 100% {
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
                        0 2px 4px -1px rgba(0, 0, 0, 0.06);
          }
          50% {
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15),
                        0 10px 10px -5px rgba(0, 0, 0, 0.08);
          }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .animate-breathing-shadow {
          animation: breathing-shadow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

export default WelcomeMessage2
