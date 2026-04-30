import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BadgePlus, Bot, Check, ChevronDown, Pencil, Sparkle } from 'lucide-react'
import { AddAssistantDrawer } from '@renderer/components/chat/chatInput/toolbar/AddAssistantDrawer'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { getActiveSmartMessages } from '@renderer/db/SmartMessageRepository'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useAssistantStore } from '@renderer/store/assistant'
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

const getAssistantInitial = (name: string): string => (
  name.trim().charAt(0).toUpperCase() || 'A'
)

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
        'smart-message-layer absolute left-1/2 top-0 block w-[min(590px,92%)] origin-center',
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

const SmartAssistantSelector: React.FC = () => {
  const { getModelOptions, providersRevision } = useAppConfigStore()
  const { assistants, currentAssistant, setCurrentAssistant, loadAssistants, isLoading } = useAssistantStore()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [assistantToEdit, setAssistantToEdit] = useState<Assistant | null>(null)

  useEffect(() => {
    if (assistants.length === 0) {
      void loadAssistants()
    }
  }, [assistants.length, loadAssistants])

  const modelOptions = useMemo(() => getModelOptions(), [getModelOptions, providersRevision])
  const currentAssistantLabel = currentAssistant?.name ?? 'General'
  const currentAssistantDetail = currentAssistant?.description?.trim() || 'Default chat setup'

  const getAssistantDetail = (assistant: Assistant): string => {
    const description = assistant.description?.trim()
    if (description) return description

    const modelOption = modelOptions.find(option =>
      option.account.id === assistant.modelRef.accountId
      && option.model.id === assistant.modelRef.modelId
    )

    return modelOption?.model.label ?? 'Custom instructions'
  }

  const handleSelectAssistant = (assistant: Assistant | null) => {
    setCurrentAssistant(assistant)
    setPopoverOpen(false)
  }

  const handleCreateAssistant = () => {
    setPopoverOpen(false)
    setCreateDrawerOpen(true)
  }

  const handleEditAssistant = (assistant: Assistant) => {
    setAssistantToEdit(assistant)
    setPopoverOpen(false)
    setEditDrawerOpen(true)
  }

  return (
    <>
      <div className="smart-assistant-selector smart-animate-rise">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Current assistant: ${currentAssistantLabel}`}
              aria-expanded={popoverOpen}
              className={cn(
                'smart-assistant-trigger group flex h-7 max-w-[176px] items-center gap-1.5 rounded-full border',
                'border-transparent bg-transparent px-2 text-left text-muted-foreground shadow-none',
                'transition-[opacity,background-color,border-color,color,transform] duration-240 ease-(--smart-ease-out)',
                'hover:border-border/42 hover:bg-card/48 hover:text-foreground/78',
                'focus-visible:border-border/55 focus-visible:bg-card/56 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/18',
                'active:scale-[0.99]'
              )}
            >
              <span className="grid size-4 shrink-0 place-items-center text-muted-foreground/62 transition-colors duration-200 group-hover:text-foreground/68 group-focus-visible:text-foreground/72">
                <Bot className="size-3" />
              </span>
              <span className="min-w-0 max-w-[118px] truncate text-[10.5px] font-medium leading-4 text-current">
                {currentAssistantLabel}
              </span>
              <ChevronDown
                className={cn(
                  'size-3 shrink-0 text-current opacity-55 transition-[opacity,transform] duration-200 ease-(--smart-ease-out) group-hover:opacity-70',
                  popoverOpen && 'rotate-180'
                )}
              />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            sideOffset={10}
            className={cn(
              'w-[min(340px,calc(100vw-32px))] rounded-2xl border-border/70 bg-popover/95 p-2',
              'text-popover-foreground shadow-[0_30px_82px_-42px_rgba(15,23,42,0.58)] backdrop-blur-xl'
            )}
          >
            <div className="px-2.5 pb-2 pt-1.5">
              <p className="m-0 text-[11px] font-semibold uppercase leading-4 tracking-normal text-muted-foreground">
                Assistant
              </p>
              <p className="m-0 truncate text-sm font-medium leading-5 text-foreground">
                {currentAssistantLabel}
              </p>
              <p className="m-0 truncate text-xs leading-5 text-muted-foreground">
                {currentAssistantDetail}
              </p>
            </div>

            <div
              className="max-h-[268px] overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Assistant options"
            >
              <div
                className={cn(
                  'group/assistant flex items-center gap-1 rounded-xl p-1 transition-colors duration-160',
                  currentAssistant === null ? 'bg-foreground/[0.045]' : 'hover:bg-foreground/[0.032]'
                )}
              >
                <button
                  type="button"
                  aria-pressed={currentAssistant === null}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/26"
                  onClick={() => handleSelectAssistant(null)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.055] text-foreground/70">
                    <Bot className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium leading-5 text-foreground">
                      General
                    </span>
                    <span className="block truncate text-xs leading-4 text-muted-foreground">
                      Default chat setup
                    </span>
                  </span>
                  <Check
                    className={cn(
                      'size-4 shrink-0 text-foreground transition-opacity duration-160',
                      currentAssistant === null ? 'opacity-80' : 'opacity-0'
                    )}
                  />
                </button>
              </div>

              {isLoading && assistants.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  Loading assistants...
                </div>
              ) : (
                assistants.map(assistant => {
                  const isActive = currentAssistant?.id === assistant.id
                  return (
                    <div
                      key={assistant.id}
                      className={cn(
                        'group/assistant flex items-center gap-1 rounded-xl p-1 transition-colors duration-160',
                        isActive ? 'bg-foreground/[0.045]' : 'hover:bg-foreground/[0.032]'
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={isActive}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/26"
                        onClick={() => handleSelectAssistant(isActive ? null : assistant)}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-[12px] font-semibold text-foreground/72">
                          {getAssistantInitial(assistant.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium leading-5 text-foreground">
                            {assistant.name}
                          </span>
                          <span className="block truncate text-xs leading-4 text-muted-foreground">
                            {getAssistantDetail(assistant)}
                          </span>
                        </span>
                        <Check
                          className={cn(
                            'size-4 shrink-0 text-foreground transition-opacity duration-160',
                            isActive ? 'opacity-80' : 'opacity-0'
                          )}
                        />
                      </button>

                      <button
                        type="button"
                        title={`Edit ${assistant.name}`}
                        aria-label={`Edit ${assistant.name}`}
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground',
                          'opacity-0 transition-[background-color,color,opacity] duration-160',
                          'hover:bg-foreground/[0.055] hover:text-foreground',
                          'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/26',
                          'group-hover/assistant:opacity-100 group-focus-within/assistant:opacity-100',
                          isActive && 'opacity-100'
                        )}
                        onClick={() => handleEditAssistant(assistant)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            <div className="mt-2 border-t border-border/62 pt-2">
              <button
                type="button"
                className={cn(
                  'flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/70',
                  'bg-transparent px-3 text-xs font-medium text-muted-foreground transition-[background-color,border-color,color] duration-180',
                  'hover:border-foreground/12 hover:bg-foreground/[0.035] hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/26'
                )}
                onClick={handleCreateAssistant}
              >
                <BadgePlus className="size-3.5" />
                New Assistant
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <AddAssistantDrawer
        isExpanded={true}
        variant="compact"
        modelOptions={modelOptions}
        trigger={null}
        open={createDrawerOpen}
        onOpenChange={setCreateDrawerOpen}
      />

      {assistantToEdit && (
        <AddAssistantDrawer
          isExpanded={true}
          variant="compact"
          mode="edit"
          assistantToEdit={assistantToEdit}
          modelOptions={modelOptions}
          trigger={null}
          open={editDrawerOpen}
          onOpenChange={(nextOpen) => {
            setEditDrawerOpen(nextOpen)
            if (!nextOpen) {
              setAssistantToEdit(null)
            }
          }}
        />
      )}
    </>
  )
}

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
  const [smartMessages, setSmartMessages] = useState<SmartStackMessage[]>(FALLBACK_MESSAGES)

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

  useEffect(() => {
    let cancelled = false

    getActiveSmartMessages(3)
      .then(messages => {
        if (cancelled || messages.length === 0) return
        setSmartMessages(messages.map(message => ({
          id: message.id,
          title: message.title,
          body: message.body,
          actionPrompt: message.actionPrompt
        })))
      })
      .catch(() => {
        if (!cancelled) {
          setSmartMessages(FALLBACK_MESSAGES)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const stackMessages = useMemo(() => smartMessages, [smartMessages])

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

      <SmartAssistantSelector />

      <div className="smart-welcome-inner relative z-1 grid w-[min(760px,100%)] grid-rows-[auto_auto] justify-items-center gap-[clamp(22px,4vh,38px)]">
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
      </div>
    </section>
  )
}

export default SmartWelcomeEntrance
