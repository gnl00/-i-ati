import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { getEmotionAssetUrl } from '@renderer/shared/assets/emotions/emotionAssetUrls'
import { cn } from '@renderer/shared/lib/utils'
import { getActiveSmartMessages } from '@renderer/infrastructure/persistence/SmartMessageRepository'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
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
