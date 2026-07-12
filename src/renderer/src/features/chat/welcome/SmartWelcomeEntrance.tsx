import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BadgePlus, Bot, Check, ChevronDown, Pencil } from 'lucide-react'
import { AddAssistantDrawer } from '@renderer/features/chat/input/toolbar/AddAssistantDrawer'
import { getEmotionAssetUrl } from '@renderer/shared/assets/emotions/emotionAssetUrls'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/shared/components/ui/popover'
import { cn } from '@renderer/shared/lib/utils'
import { getActiveSmartMessages } from '@renderer/infrastructure/persistence/SmartMessageRepository'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import { useAssistantStore } from '@renderer/features/assistants'
import { pickEmotionEmoji } from '@shared/emotion/emotionAssetCatalog'
import {
  getMsUntilNextSmartGreetingRefresh,
  pickSmartGreeting,
  type TimeOfDay
} from './smartGreeting'
import { useWelcomeEmotionState, WELCOME_EMOTION_FALLBACK } from './useWelcomeEmotionState'
import './SmartWelcomeEntrance.css'

const CONFIG = {
  TYPEWRITER_SPEED: 56
} as const

type MessageTone = 'primary' | 'secondary' | 'tertiary'

interface SmartWelcomeEntranceProps {
  className?: string
  isExiting?: boolean
  isComposerFocused?: boolean
  composer?: React.ReactNode
  onSuggestionClick?: (suggestion: string) => void
}

interface SmartStackMessage {
  id: string
  title: string
  body: string
  actionPrompt: string
}

interface GreetingProps {
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

interface MessageDeckProps {
  messages: SmartStackMessage[]
  onSelect: (message: SmartStackMessage) => void
}

interface MessageCardProps {
  message: SmartStackMessage
  tone: MessageTone
  index: number
  active: boolean
  muted: boolean
  onSelect: (message: SmartStackMessage) => void
  onActivate: () => void
  onRelease: () => void
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

const getStoredUserName = (): string => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem('username')?.trim() || ''
}

const getMessageTone = (index: number): MessageTone => {
  if (index === 0) return 'primary'
  if (index === 1) return 'secondary'
  return 'tertiary'
}

const getPointerActiveIndex = (
  pointerY: number,
  deckHeight: number,
  messageCount: number
): number | null => {
  if (messageCount <= 0) return null
  if (messageCount === 1) return 0

  const primaryBoundary = deckHeight * 0.31
  const secondaryBoundary = deckHeight * 0.58

  if (pointerY < primaryBoundary) return 0
  if (messageCount === 2 || pointerY < secondaryBoundary) return 1

  return 2
}

const getAssistantInitial = (name: string): string => (
  name.trim().charAt(0).toUpperCase() || 'A'
)

const EditableUserName: React.FC<GreetingProps> = ({
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
          'inline-block h-[1.16em] w-[min(168px,44vw)] border-0 border-b border-dashed',
          'border-muted-foreground/42 bg-transparent px-1 text-center font-[inherit]',
          'text-foreground outline-hidden focus:border-foreground/70'
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={onStartEditing}
      className={cn(
        'welcome-v2-name inline-flex max-w-[min(260px,54vw)] items-baseline justify-center',
        '-mx-1 overflow-hidden rounded-xl border-0 bg-transparent px-1.5',
        'font-[inherit] text-muted-foreground text-ellipsis whitespace-nowrap',
        'transition-[background-color,color,box-shadow] duration-200 ease-(--welcome-v2-ease)',
        'hover:bg-foreground/[0.045] hover:text-foreground',
        'focus-visible:bg-foreground/[0.055] focus-visible:text-foreground focus-visible:outline-hidden',
        username && 'text-foreground'
      )}
    >
      {username || 'there'}
    </button>
  )
}

const Greeting: React.FC<GreetingProps> = (props) => (
  <header className="welcome-v2-greeting grid gap-3 text-left">
    <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/64">
      @i workbench
    </p>
    <h1 className="m-0 min-h-[1.16em] max-w-[780px] text-[clamp(34px,5.6cqi,62px)] font-semibold leading-[0.98] tracking-[-0.055em] text-foreground">
      <EditableUserName {...props} />
      <span>{props.typedText}</span>
      <span className="welcome-v2-caret" aria-hidden="true" />
    </h1>
    <p className="m-0 max-w-[520px] text-[clamp(14px,1.65cqi,17px)] font-medium leading-6 text-muted-foreground/78">
      {props.subtitleText}
    </p>
  </header>
)

const EmotionBadge: React.FC<{ active: boolean }> = ({ active }) => {
  const emotionAssetPack = useAppConfigStore(state => state.appConfig.emotion?.assetPack || 'default')
  const { label, intensity } = useWelcomeEmotionState()
  const [assetFailed, setAssetFailed] = useState(false)
  const emojiLabel = assetFailed ? WELCOME_EMOTION_FALLBACK.label : label
  const emojiIntensity = assetFailed ? WELCOME_EMOTION_FALLBACK.intensity : intensity
  const mainEmoji = pickEmotionEmoji(emojiLabel, emojiIntensity)
  const emotionAssetUrl = getEmotionAssetUrl(
    emotionAssetPack,
    label,
    intensity
  )
  const shouldRenderAsset = Boolean(emotionAssetUrl) && !assetFailed

  useEffect(() => {
    setAssetFailed(false)
  }, [emotionAssetUrl])

  return (
    <div
      className={cn(
        'welcome-v2-emotion pointer-events-none absolute right-[clamp(2px,4cqi,56px)] top-[clamp(0px,2cqi,26px)] z-3',
        active && 'welcome-v2-emotion-active'
      )}
      aria-hidden="true"
    >
      <div className="welcome-v2-emotion-core">
        {shouldRenderAsset ? (
          <img
            src={emotionAssetUrl}
            alt=""
            className="welcome-v2-emotion-asset"
            onError={() => setAssetFailed(true)}
          />
        ) : (
          <span className="welcome-v2-emotion-emoji">{mainEmoji}</span>
        )}
      </div>
    </div>
  )
}

const MessageCard: React.FC<MessageCardProps> = ({
  message,
  tone,
  index,
  active,
  muted,
  onSelect,
  onActivate,
  onRelease
}) => (
  <button
    type="button"
    className={cn(
      'welcome-v2-deck-card absolute left-1/2 top-0 block w-[min(612px,94%)] origin-center',
      'cursor-pointer border-0 bg-transparent p-0 text-left text-inherit',
      'transition-[opacity,filter,transform] duration-320 ease-(--welcome-v2-ease)',
      `welcome-v2-deck-card-${tone}`,
      active && 'welcome-v2-deck-card-active',
      muted && 'welcome-v2-deck-card-muted'
    )}
    style={{ '--welcome-v2-card-index': index } as React.CSSProperties}
    onClick={() => onSelect(message)}
    onFocus={onActivate}
    onBlur={onRelease}
    aria-label={message.title}
  >
    <span
      className={cn(
        'welcome-v2-message relative grid min-h-[118px] content-center gap-2 overflow-hidden rounded-[22px]',
        'border border-(--welcome-v2-card-border) px-6 py-5 shadow-(--welcome-v2-card-shadow)',
        'transition-[background-color,border-color,box-shadow,transform] duration-260 ease-(--welcome-v2-ease)'
      )}
    >
      <span className="relative z-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/66">
        {message.title}
      </span>
      <span className="relative z-1 block max-w-[470px] text-[clamp(15px,2.05cqi,18px)] font-medium leading-[1.45] tracking-[-0.012em] text-foreground/90">
        {message.body}
      </span>
      <span
        className={cn(
          'welcome-v2-message-action absolute bottom-5 right-5 z-1 grid size-8 place-items-center',
          'rounded-full bg-foreground/[0.075] text-foreground/78 opacity-0',
          'transition-[opacity,transform,background-color] duration-220 ease-(--welcome-v2-ease)'
        )}
        aria-hidden="true"
      >
        <ArrowRight className="size-4" />
      </span>
    </span>
  </button>
)

const MessageDeck: React.FC<MessageDeckProps> = ({
  messages,
  onSelect
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const activeIndexRef = useRef<number | null>(null)
  const deckRef = useRef<HTMLDivElement>(null)
  const deckRectRef = useRef<DOMRect | null>(null)
  const latestPointerRef = useRef({ x: 0, y: 0 })
  const pointerFrameRef = useRef<number | null>(null)

  const updateActiveIndex = (nextIndex: number | null): void => {
    if (activeIndexRef.current === nextIndex) return
    activeIndexRef.current = nextIndex
    setActiveIndex(nextIndex)
  }

  const schedulePointerWrite = (): void => {
    if (pointerFrameRef.current !== null) return

    pointerFrameRef.current = window.requestAnimationFrame(() => {
      pointerFrameRef.current = null
      const deckEl = deckRef.current
      if (!deckEl) return

      const { x, y } = latestPointerRef.current
      deckEl.style.setProperty('--welcome-v2-pointer-x', String(x))
      deckEl.style.setProperty('--welcome-v2-pointer-y', String(y))
    })
  }

  useEffect(() => {
    const refreshDeckRect = (): void => {
      if (deckRef.current) {
        deckRectRef.current = deckRef.current.getBoundingClientRect()
      }
    }

    window.addEventListener('resize', refreshDeckRect)

    return () => {
      window.removeEventListener('resize', refreshDeckRect)
      if (pointerFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerFrameRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={deckRef}
      className="welcome-v2-deck relative h-[clamp(302px,38vh,386px)] w-[min(760px,100%)]"
      onPointerEnter={event => {
        deckRectRef.current = event.currentTarget.getBoundingClientRect()
      }}
      onPointerMove={event => {
        const rect = deckRectRef.current
        if (!rect) return

        const pointerY = event.clientY - rect.top
        latestPointerRef.current = {
          x: (event.clientX - rect.left) / rect.width - 0.5,
          y: (event.clientY - rect.top) / rect.height - 0.5
        }
        schedulePointerWrite()
        updateActiveIndex(getPointerActiveIndex(pointerY, rect.height, messages.length))
      }}
      onPointerLeave={() => {
        deckRectRef.current = null
        latestPointerRef.current = { x: 0, y: 0 }
        schedulePointerWrite()
        updateActiveIndex(null)
      }}
      aria-label="Suggested agent messages"
    >
      {messages.map((message, index) => (
        <MessageCard
          key={message.id}
          message={message}
          tone={getMessageTone(index)}
          index={index}
          active={activeIndex === index}
          muted={activeIndex !== null && activeIndex !== index}
          onSelect={onSelect}
          onActivate={() => updateActiveIndex(index)}
          onRelease={() => {
            if (activeIndexRef.current === index) updateActiveIndex(null)
          }}
        />
      ))}
    </div>
  )
}

const SmartWelcomeAssistantSelector: React.FC = () => {
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
      <div className="welcome-v2-assistant-selector">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Current assistant: ${currentAssistantLabel}`}
              aria-expanded={popoverOpen}
              className={cn(
                'welcome-v2-assistant-trigger group flex h-8 max-w-[184px] items-center gap-1.5 rounded-full border',
                'border-border/32 bg-card/36 px-2.5 text-left text-muted-foreground shadow-xs backdrop-blur-xl',
                'transition-[background-color,border-color,color,opacity,transform] duration-220 ease-(--welcome-v2-ease)',
                'hover:border-border/62 hover:bg-card/58 hover:text-foreground/82',
                'focus-visible:border-border/70 focus-visible:bg-card/64 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/18',
                'active:scale-[0.99]'
              )}
            >
              <span className="grid size-4 shrink-0 place-items-center text-muted-foreground/68 transition-colors duration-200 group-hover:text-foreground/72">
                <Bot className="size-3" />
              </span>
              <span className="min-w-0 max-w-[122px] truncate text-[10.5px] font-semibold leading-4 text-current">
                {currentAssistantLabel}
              </span>
              <ChevronDown
                className={cn(
                  'size-3 shrink-0 text-current opacity-55 transition-[opacity,transform] duration-200 ease-(--welcome-v2-ease) group-hover:opacity-72',
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
              <p className="m-0 text-[11px] font-semibold uppercase leading-4 tracking-[0.16em] text-muted-foreground">
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
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/26"
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
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/26"
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
                          'focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/26',
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
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/26'
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
  isComposerFocused = false,
  composer,
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
    let refreshTimer: number | null = null

    const refreshGreeting = () => {
      const nextGreeting = pickSmartGreeting()
      setTimeOfDay(nextGreeting.timeOfDay)
      setSubtitleText(nextGreeting.subtitleText)
    }

    const clearRefreshTimer = () => {
      if (refreshTimer === null) return
      window.clearTimeout(refreshTimer)
      refreshTimer = null
    }

    const scheduleNextRefresh = () => {
      clearRefreshTimer()
      refreshTimer = window.setTimeout(() => {
        refreshGreeting()
        scheduleNextRefresh()
      }, getMsUntilNextSmartGreetingRefresh())
    }

    const refreshAndSchedule = () => {
      refreshGreeting()
      scheduleNextRefresh()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAndSchedule()
      }
    }

    refreshAndSchedule()
    window.addEventListener('focus', refreshAndSchedule)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearRefreshTimer()
      window.removeEventListener('focus', refreshAndSchedule)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (isExiting) return

    const suffixText = `, good ${timeOfDay}.`
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
        'welcome-v2-stage welcome-message relative flex h-full min-h-full grow w-full overflow-hidden text-foreground @container',
        isExiting && 'welcome-v2-exit',
        isComposerFocused && 'welcome-v2-composer-focused',
        className
      )}
    >
      <div className="welcome-v2-bg" aria-hidden="true" />
      <SmartWelcomeAssistantSelector />

      <div className="welcome-v2-shell relative z-1 mx-auto flex h-full min-h-0 w-[min(940px,100%)] flex-col px-[clamp(20px,5vw,72px)] pb-[clamp(20px,4vh,46px)] pt-(--welcome-v2-safe-top)">
        <div className="welcome-v2-top relative flex shrink-0 basis-[clamp(134px,20vh,198px)] items-end">
          <Greeting
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
          <EmotionBadge active={isComposerFocused} />
        </div>

        <div className="welcome-v2-middle relative grid min-h-0 flex-1 place-items-center py-[clamp(8px,2vh,22px)]">
          <MessageDeck
            messages={stackMessages}
            onSelect={handleMessageSelect}
          />
        </div>

        <div className="welcome-v2-bottom relative z-10 grid shrink-0 basis-[clamp(112px,18vh,166px)] items-end justify-items-center">
          {composer}
        </div>
      </div>
    </section>
  )
}

export default SmartWelcomeEntrance
