import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Sparkle } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import './SmartWelcomeMessage.css'

const CONFIG = {
  TYPEWRITER_SPEED: 60
} as const

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'
type SmartLayerTone = 'top' | 'mid' | 'bottom'

interface SmartWelcomeEntranceProps {
  className?: string
  isExiting?: boolean
  onSuggestionClick?: (suggestion: string) => void
}

interface SmartStackMessage {
  id: string
  title: string
  body: string
  actionPrompt: string
}

interface SmartGreetingHeroProps {
  typedText: string
  subtitleText: string
  username: string
  usernameDraft: string
  isEditingUserName: boolean
  onStartEditing: () => void
  onChangeDraft: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

interface SmartMessageStackProps {
  messages: SmartStackMessage[]
  onSelect: (message: SmartStackMessage) => void
}

interface SmartMessageLayerProps {
  message: SmartStackMessage
  tone: SmartLayerTone
  depth: number
  hovered: boolean
  dimmed: boolean
  onSelect: (message: SmartStackMessage) => void
  onActivate: () => void
  onHoverStart: () => void
  onHoverEnd: () => void
}

const TIME_OF_DAY_LINES: Record<TimeOfDay, string[]> = {
  morning: [
    "Let's start with one sharp priority.",
    "What should move first this morning?",
    "Ready for a focused start?"
  ],
  afternoon: [
    "Let's keep the important work moving.",
    "What needs a clean next step?",
    "Want to push one task forward?"
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

const FALLBACK_MESSAGES: SmartStackMessage[] = [
  {
    id: 'smart-focus-plan',
    title: 'Focused plan',
    body: "Need a focused plan for today's work session?",
    actionPrompt: "Help me create a focused plan for today's work session."
  },
  {
    id: 'smart-flow-review',
    title: 'Flow review',
    body: 'I can review your retry / locking flow and list possible edge cases.',
    actionPrompt: 'Review my retry and locking flow, then list the possible edge cases and failure modes.'
  },
  {
    id: 'smart-follow-ups',
    title: 'Follow-ups',
    body: 'You still have unfinished follow-ups from yesterday. Want me to summarize them into actions?',
    actionPrompt: 'Summarize my unfinished follow-ups into clear action items with priorities.'
  }
]

const getTimeOfDay = (hour: number): TimeOfDay => {
  if (hour >= 5 && hour <= 11) return 'morning'
  if (hour >= 12 && hour <= 17) return 'afternoon'
  if (hour >= 18 && hour <= 21) return 'evening'
  return 'night'
}

const getStoredUserName = (): string => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem('username')?.trim() || ''
}

const getLayerTone = (index: number): SmartLayerTone => {
  if (index === 0) return 'top'
  if (index === 1) return 'mid'
  return 'bottom'
}

const SmartEditableUserName: React.FC<SmartGreetingHeroProps> = ({
  username,
  usernameDraft,
  isEditingUserName,
  onStartEditing,
  onChangeDraft,
  onSave,
  onCancel
}) => {
  if (isEditingUserName) {
    return (
      <input
        autoFocus
        value={usernameDraft}
        onChange={event => onChangeDraft(event.target.value)}
        onBlur={onSave}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            onSave()
          }
          if (event.key === 'Escape') {
            onCancel()
          }
        }}
        placeholder="username"
        className={cn(
          'inline-block h-[1.24em] w-[min(150px,42vw)] border-0 border-b border-dashed',
          'border-muted-foreground/50 bg-transparent px-1 text-center font-[inherit]',
          'text-foreground outline-none focus:border-foreground'
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={onStartEditing}
      className={cn(
        'inline-flex min-w-12 max-w-[min(240px,54vw)] items-baseline justify-center',
        '-mx-[3px] overflow-hidden rounded-lg border-0 bg-transparent px-[5px]',
        'font-[inherit] text-muted-foreground text-ellipsis whitespace-nowrap transition-colors',
        'duration-200 ease-(--smart-ease-out) hover:bg-accent/40 hover:text-foreground',
        'focus-visible:bg-accent/40 focus-visible:text-foreground focus-visible:outline-none',
        username && 'text-foreground'
      )}
    >
      {username || 'there'}
    </button>
  )
}

const SmartGreetingHero: React.FC<SmartGreetingHeroProps> = (props) => (
  <header className="smart-animate-rise grid justify-items-center gap-4 text-center">
    <h1 className="m-0 min-h-[1.25em] font-mono text-[clamp(28px,4.2cqi,42px)] font-light leading-[1.18] tracking-normal text-foreground">
      <span>Hi </span>
      <SmartEditableUserName {...props} />
      <span>{props.typedText}</span>
      <span className="animate-pulse">|</span>
    </h1>

    <p className="m-0 max-w-[560px] text-[clamp(15px,2cqi,18px)] font-light leading-[1.55] text-muted-foreground">
      {props.subtitleText}
    </p>
  </header>
)

const SmartMessageLayer: React.FC<SmartMessageLayerProps> = ({
  message,
  tone,
  depth,
  hovered,
  dimmed,
  onSelect,
  onActivate,
  onHoverStart,
  onHoverEnd
}) => {
  return (
    <button
      type="button"
      className={cn(
        'smart-message-layer absolute left-1/2 top-3 block w-[min(590px,92%)] origin-center',
        'cursor-pointer border-0 bg-transparent p-4 text-left text-inherit',
        'transition-[opacity,filter,transform] duration-320 ease-(--smart-ease-out)',
        'will-change-[transform,opacity,filter]',
        `smart-message-layer-${tone}`,
        hovered && 'smart-message-layer-hovered',
        dimmed && 'smart-message-layer-dimmed'
      )}
      style={{ '--smart-depth': depth } as React.CSSProperties}
      onClick={() => {
        onActivate()
        onSelect(message)
      }}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      aria-label={message.title}
    >
      <span
        className={cn(
          'smart-message-bubble relative grid min-h-28 content-center gap-2 overflow-hidden rounded-[14px]',
          'border border-(--smart-border) px-3 py-1',
          'shadow-(--smart-shadow) transition-[border-color,box-shadow,background-color]',
          'duration-280 ease-(--smart-ease-out)'
        )}
      >
        <span className="relative z-1 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
          {message.title}
        </span>
        <span className="smart-message-body relative z-1 block max-w-[460px] text-[clamp(15px,2.25cqi,18px)] font-normal leading-[1.48] tracking-normal text-foreground">
          {message.body}
        </span>
        <span
          className={cn(
            'smart-message-action absolute bottom-5 right-[22px] z-1 grid size-[30px] place-items-center',
            'rounded-full bg-foreground/[0.07] text-foreground opacity-0 translate-x-[-6px]',
            'transition-[opacity,transform,background-color] duration-220 ease-(--smart-ease-out)'
          )}
          aria-hidden="true"
        >
          <ArrowRight className="size-4" />
        </span>
      </span>

      {tone === 'top' && (
        <span
          className="smart-message-tail absolute bottom-[-32px] left-[calc(50%+150px)] h-[38px] w-px bg-linear-to-b from-border/80 to-transparent"
          aria-hidden="true"
        />
      )}
    </button>
  )
}

const SmartMessageStack: React.FC<SmartMessageStackProps> = ({
  messages,
  onSelect
}) => {
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const highlightIndex = hoverIndex ?? activeIndex

  return (
    <div
      className={cn(
        'smart-message-stack relative h-[clamp(286px,39vh,386px)] w-[min(680px,100%)]',
        'perspective-distant transform-3d'
      )}
      style={{
        '--smart-pointer-x': pointer.x,
        '--smart-pointer-y': pointer.y
      } as React.CSSProperties}
      onPointerMove={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        setPointer({
          x: (event.clientX - rect.left) / rect.width - 0.5,
          y: (event.clientY - rect.top) / rect.height - 0.5
        })
      }}
      onPointerLeave={() => {
        setPointer({ x: 0, y: 0 })
        setHoverIndex(null)
      }}
      aria-label="Suggested agent messages"
    >
      {messages.map((message, index) => (
        <SmartMessageLayer
          key={message.id}
          message={message}
          tone={getLayerTone(index)}
          depth={index}
          hovered={highlightIndex === index}
          dimmed={highlightIndex !== null && highlightIndex !== index}
          onSelect={onSelect}
          onActivate={() => setActiveIndex(index)}
          onHoverStart={() => {
            setHoverIndex(index)
            setActiveIndex(index)
          }}
          onHoverEnd={() => setHoverIndex(current => current === index ? null : current)}
        />
      ))}
    </div>
  )
}

const SmartFooterHint: React.FC = () => (
  <footer className="smart-animate-rise smart-welcome-footer grid justify-items-center gap-2 text-center text-xs font-light leading-[1.45] text-muted-foreground/80">
    <div className="inline-flex items-center gap-[7px] text-muted-foreground/75" aria-hidden="true">
      <span className="size-1 rounded-full bg-muted-foreground/40 shadow-[0_0_0_3px_rgba(148,163,184,0.05)] animate-pulse" />
      <span>Generated for you just now</span>
    </div>
    <p className="m-0 text-muted-foreground">Or type your own question below</p>
  </footer>
)

const SmartWelcomeEntrance: React.FC<SmartWelcomeEntranceProps> = ({
  className,
  isExiting = false,
  onSuggestionClick
}) => {
  const [typedText, setTypedText] = useState('')
  const [subtitleText, setSubtitleText] = useState("Let's start with one sharp priority.")
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning')
  const [username, setUsername] = useState('')
  const [usernameDraft, setUsernameDraft] = useState('')
  const [isEditingUserName, setIsEditingUserName] = useState(false)

  useEffect(() => {
    const saved = getStoredUserName()
    setUsername(saved)
    setUsernameDraft(saved)
  }, [])

  useEffect(() => {
    const nextTimeOfDay = getTimeOfDay(new Date().getHours())
    const lines = TIME_OF_DAY_LINES[nextTimeOfDay]
    const randomLine = lines[Math.floor(Math.random() * lines.length)] ?? lines[0]

    setTimeOfDay(nextTimeOfDay)
    setSubtitleText(randomLine)
  }, [username])

  useEffect(() => {
    if (isExiting) return

    const suffixText = `, Good ${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)}.`
    let index = 0
    const typeInterval = window.setInterval(() => {
      if (index <= suffixText.length) {
        setTypedText(suffixText.slice(0, index))
        index += 1
        return
      }
      window.clearInterval(typeInterval)
    }, CONFIG.TYPEWRITER_SPEED)

    return () => window.clearInterval(typeInterval)
  }, [timeOfDay, isExiting])

  const stackMessages = useMemo(() => FALLBACK_MESSAGES, [])

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

  const cancelEditingUserName = () => {
    setUsernameDraft(username)
    setIsEditingUserName(false)
  }

  const handleMessageSelect = (message: SmartStackMessage) => {
    onSuggestionClick?.(message.actionPrompt)
  }

  return (
    <section
      className={cn(
        'smart-welcome-entrance welcome-message relative flex min-h-[min(72vh,720px)] w-full',
        'items-center justify-center overflow-hidden px-[clamp(20px,5vw,72px)]',
        'py-[clamp(32px,5vh,56px)] text-foreground @container',
        className
      )}
    >
      <div className="smart-welcome-depth-field pointer-events-none absolute inset-0 opacity-[0.42]" aria-hidden="true">
        <Sparkle className="absolute left-[calc(50%-min(33vw,310px))] top-[38%] size-4 text-muted-foreground/30" />
        <Sparkle className="absolute right-[calc(50%-min(31vw,290px))] top-[66%] size-4 scale-[0.74] text-muted-foreground/30" />
      </div>

      <div className="smart-welcome-inner relative z-1 grid w-[min(760px,100%)] grid-rows-[auto_auto_auto] justify-items-center gap-[clamp(22px,4vh,38px)]">
        <SmartGreetingHero
          typedText={typedText}
          subtitleText={subtitleText}
          username={username}
          usernameDraft={usernameDraft}
          isEditingUserName={isEditingUserName}
          onStartEditing={() => setIsEditingUserName(true)}
          onChangeDraft={setUsernameDraft}
          onSave={saveUserName}
          onCancel={cancelEditingUserName}
        />

        <SmartMessageStack
          messages={stackMessages}
          onSelect={handleMessageSelect}
        />

        <SmartFooterHint />
      </div>
    </section>
  )
}

export default SmartWelcomeEntrance
