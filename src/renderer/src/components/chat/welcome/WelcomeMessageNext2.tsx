import React, { useState, useEffect } from 'react'
import { cn } from '@renderer/lib/utils'
import { useAssistantStore } from '@renderer/store/assistant'
import { useChatStore } from '@renderer/store/chatStore'
import './WelcomeMessage.css'
import { ArrowRight, Check } from 'lucide-react'

// ============================================================================
// Constants
// ============================================================================
const CONFIG = {
  TYPEWRITER_SPEED: 60,
} as const

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

const TIME_OF_DAY_LINES: Record<TimeOfDay, string[]> = {
  morning: [
    "What are you building this morning?",
    "Let's start with your top priority.",
    "Ready to make progress?"
  ],
  afternoon: [
    "Let's keep the momentum going.",
    "What should we tackle next?",
    "Want to move one task across the line?"
  ],
  evening: [
    "Let's wrap up with a focused win.",
    "Need help finishing today's work?",
    "Want a clean handoff for tomorrow?"
  ],
  night: [
    "Late session. Let's keep it simple.",
    "Need a quick push before you sign off?",
    "Want to finish one more thing tonight?"
  ]
}

// ============================================================================
// Avatar Color System - Premium Gradient Schemes
// ============================================================================
interface AvatarGradient {
  from: string
  to: string
  glow: string
  border: string
  text: string
}

// Ultra-subtle gradients - nearly invisible, just a hint of color
const AVATAR_GRADIENTS: AvatarGradient[] = [
  // Barely-there color hints - primarily neutral
  { from: 'from-violet-500/4', to: 'to-fuchsia-500/4', glow: 'shadow-violet-500/8', border: 'border-violet-500/10', text: 'text-violet-500 dark:text-violet-400' },
  { from: 'from-cyan-500/4', to: 'to-blue-500/4', glow: 'shadow-cyan-500/8', border: 'border-cyan-500/10', text: 'text-cyan-500 dark:text-cyan-400' },
  { from: 'from-emerald-500/4', to: 'to-teal-500/4', glow: 'shadow-emerald-500/8', border: 'border-emerald-500/10', text: 'text-emerald-500 dark:text-emerald-400' },
  { from: 'from-rose-500/4', to: 'to-pink-500/4', glow: 'shadow-rose-500/8', border: 'border-rose-500/10', text: 'text-rose-500 dark:text-rose-400' },
  { from: 'from-amber-500/4', to: 'to-orange-500/4', glow: 'shadow-amber-500/8', border: 'border-amber-500/10', text: 'text-amber-500 dark:text-amber-400' },

  // Neutral tones - the primary palette
  { from: 'from-slate-500/5', to: 'to-gray-500/5', glow: 'shadow-slate-500/8', border: 'border-slate-500/10', text: 'text-slate-500 dark:text-slate-400' },
  { from: 'from-zinc-500/5', to: 'to-neutral-500/5', glow: 'shadow-zinc-500/8', border: 'border-zinc-500/10', text: 'text-zinc-500 dark:text-zinc-400' },
  { from: 'from-stone-500/5', to: 'to-stone-500/5', glow: 'shadow-stone-500/8', border: 'border-stone-500/10', text: 'text-stone-500 dark:text-stone-400' },
  { from: 'from-gray-500/5', to: 'to-slate-500/5', glow: 'shadow-gray-500/8', border: 'border-gray-500/10', text: 'text-gray-500 dark:text-gray-400' },
]

// ============================================================================
// Helper Functions
// ============================================================================
const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const getAvatarGradient = (name: string): AvatarGradient => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length
  return AVATAR_GRADIENTS[index]
}

const getTimeOfDay = (hour: number): TimeOfDay => {
  if (hour >= 5 && hour <= 11) return 'morning'
  if (hour >= 12 && hour <= 17) return 'afternoon'
  if (hour >= 18 && hour <= 21) return 'evening'
  return 'night'
}

const getStoredUserName = (): string => {
  if (typeof window === 'undefined') return 'there'
  const savedName = window.localStorage.getItem('username')?.trim()
  return savedName || ''
}

// ============================================================================
// Avatar Component
// ============================================================================
interface AvatarProps {
  initials: string
  name: string
  className?: string
}

const PremiumAvatar: React.FC<AvatarProps> = ({ initials, name, className }) => {
  const gradient = getAvatarGradient(name)

  return (
    <div className={cn("relative group/avatar", className)}>
      {/* Outer glow on hover */}
      <div className={cn(
        "absolute -inset-1 rounded-2xl opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-500 blur-xl",
        gradient.glow
      )} />

      {/* Gradient background with subtle grid pattern */}
      <div className={cn(
        "relative w-12 h-12 rounded-xl bg-linear-to-br transition-all duration-500",
        "flex items-center justify-center",
        "border border-white/10 dark:border-white/5",
        "group-hover/avatar:scale-105 group-hover/avatar:rotate-2 group-hover/avatar:shadow-lg",
        "overflow-hidden",
        gradient.from,
        gradient.to
      )}>
        {/* Minimal pattern overlay - barely visible */}
        <div className="absolute inset-0 opacity-3">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="0.5" fill="currentColor" className="text-foreground" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
          </svg>
        </div>

        {/* Shimmer effect on hover */}
        <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover/avatar:translate-x-full transition-transform duration-1000 ease-in-out" />

        {/* Initials text */}
        <span className={cn(
          "relative z-10 font-medium text-sm tracking-wide transition-transform duration-300",
          gradient.text,
          "group-hover/avatar:scale-95"
        )}>
          {initials}
        </span>
      </div>

      {/* Decorative corner accent - even more subtle */}
      <div className={cn(
        "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 border-t border-r rounded-tr-sm opacity-0 group-hover/avatar:opacity-60 transition-opacity duration-300",
        gradient.border
      )} />
    </div>
  )
}

// ============================================================================
// Types
// ============================================================================
interface WelcomeMessageProps {
  className?: string
  isExiting?: boolean
}

// ============================================================================
// Main Component
// ============================================================================
const WelcomeMessage: React.FC<WelcomeMessageProps> = ({
  className,
  isExiting = false
}) => {
  // Store
  const { assistants, loadAssistants, isLoading, currentAssistant, setCurrentAssistant } = useAssistantStore()
  const setUserInstruction = useChatStore(state => state.setUserInstruction)

  // Text State
  const [typedText, setTypedText] = useState('')
  const [subtitleText, setSubtitleText] = useState("What are you working on today?")
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning')
  const [username, setUsername] = useState('')
  const [usernameDraft, setUsernameDraft] = useState('')
  const [isEditingUserName, setIsEditingUserName] = useState(false)

  // Load assistants on mount
  useEffect(() => {
    loadAssistants()
  }, [])

  useEffect(() => {
    const saved = getStoredUserName()
    setUsername(saved)
    setUsernameDraft(saved)
  }, [])

  useEffect(() => {
    const now = new Date()
    const nextTimeOfDay = getTimeOfDay(now.getHours())
    const lines = TIME_OF_DAY_LINES[nextTimeOfDay]
    const randomLine = lines[Math.floor(Math.random() * lines.length)] ?? lines[0]

    setTimeOfDay(nextTimeOfDay)
    setSubtitleText(randomLine)
  }, [username])

  useEffect(() => {
    if (currentAssistant) {
      setSubtitleText(`${currentAssistant.name} is ready when you are.`)
      return
    }
    const timeOfDay = getTimeOfDay(new Date().getHours())
    const lines = TIME_OF_DAY_LINES[timeOfDay]
    const randomLine = lines[Math.floor(Math.random() * lines.length)] ?? lines[0]
    setSubtitleText(randomLine)
  }, [currentAssistant])

  // Typewriter Effect
  useEffect(() => {
    if (isExiting) {
      return
    }
    const suffixText = `, Good ${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)}.`
    let i = 0
    const typeInterval = setInterval(() => {
      if (i <= suffixText.length) {
        setTypedText(suffixText.slice(0, i))
        i++
      } else {
        clearInterval(typeInterval)
      }
    }, CONFIG.TYPEWRITER_SPEED)

    return () => clearInterval(typeInterval)
  }, [timeOfDay, isExiting])

  const handleAssistantClick = (assistant: Assistant) => {
    if (currentAssistant?.id === assistant.id) {
      setCurrentAssistant(null)
      setUserInstruction('')
      return
    }
    setCurrentAssistant(assistant)
    setUserInstruction(assistant.systemPrompt ?? '')
  }

  const saveUserName = () => {
    const next = usernameDraft.trim()
    setUsername(next)
    if (typeof window !== 'undefined') {
      if (next) {
        window.localStorage.setItem('username', next)
      } else {
        window.localStorage.removeItem('username')
      }
    }
    setIsEditingUserName(false)
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
            <h1 className="text-4xl font-mono font-light text-foreground tracking-tight">
              <span className="inline-block min-h-[1.2em]">
                Hi{' '}
                {isEditingUserName ? (
                  <input
                    autoFocus
                    value={usernameDraft}
                    onChange={e => setUsernameDraft(e.target.value)}
                    onBlur={saveUserName}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        saveUserName()
                      }
                      if (e.key === 'Escape') {
                        setUsernameDraft(username)
                        setIsEditingUserName(false)
                      }
                    }}
                    placeholder="username"
                    className={cn(
                      "inline-block h-9 w-[96px] border-b border-dashed px-1 text-center align-middle text-xl",
                      "border-slate-300/90 dark:border-slate-600/90",
                      "bg-transparent",
                      "text-slate-700 dark:text-slate-200",
                      "outline-hidden focus:border-sky-400 dark:focus:border-sky-500"
                    )}
                  />
                ) : (
                  <button
                    onClick={() => setIsEditingUserName(true)}
                    className={cn(
                      "group relative inline-flex items-center rounded-md px-1.5 -mx-1.5 transition-all duration-200 align-middle",
                      username
                        ? "text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-300"
                        : "text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300"
                    )}
                  >
                    {username || 'there'}
                    <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      click to edit
                    </span>
                  </button>
                )}
                {typedText}
                <span className="animate-pulse">|</span>
              </span>
            </h1>
          </div>

          <p className="text-center text-lg text-muted-foreground font-light max-w-xl animate-fade-in-delayed">
            {subtitleText}
          </p>

          {/* Assistant Cards */}
          <div className="w-full animate-slide-up">
            {isLoading && assistants.length === 0 ? (
              <div className="text-center text-muted-foreground">
                Loading assistants...
              </div>
            ) : assistants.length === 0 ? (
              <div className="text-center text-muted-foreground">
                No assistants available
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assistants.map((assistant) => {
                  const initials = getInitials(assistant.name)
                  const isSelected = currentAssistant?.id === assistant.id

                  return (
                    <button
                      key={assistant.id}
                      onClick={() => handleAssistantClick(assistant)}
                      className={cn(
                        "group/card text-left p-6 rounded-2xl border border-border/80 bg-card/50 backdrop-blur-sm transition-all duration-300 ease-out cursor-pointer",
                        "hover:bg-accent/40 hover:border-border hover:shadow hover:-translate-y-1"
                      )}
                      aria-label={`Select ${assistant.name}: ${assistant.description || 'No description'}`}
                    >
                      <div className="flex items-start gap-4">
                        <PremiumAvatar initials={initials} name={assistant.name} />

                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium tracking-wide text-foreground mb-1 truncate text-base group-hover/card:text-primary transition-colors duration-300">
                            {assistant.name}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                            {assistant.description || 'No description'}
                          </p>
                        </div>

                        <div className="relative shrink-0 mt-0.5 h-5 w-5">
                          {!isSelected && (
                            <ArrowRight
                              className={cn(
                                "absolute inset-0 h-5 w-5 text-muted-foreground group-hover/card:text-foreground",
                                "transition-all duration-300 ease-out",
                                "opacity-0 -translate-x-2 group-hover/card:opacity-100 group-hover/card:translate-x-0"
                              )}
                            />
                          )}
                          {isSelected && (
                            <Check
                              className={cn(
                                "absolute inset-0 h-5 w-5 text-emerald-500",
                                "transition-all duration-300 ease-out",
                                "opacity-0 scale-75",
                                "opacity-100 scale-100"
                              )}
                            />
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="animate-fade-in-delayed-2 pt-4">
            <p className="text-center text-sm text-muted-foreground font-light animate-bounce duration-1500 infinite">
              Or type your own question below
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WelcomeMessage
