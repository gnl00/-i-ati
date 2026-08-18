import { ActivityLogIcon, GearIcon } from '@radix-ui/react-icons'
import { AnimatePresence, motion } from 'framer-motion'
import { getEmotionAssetUrl } from '@renderer/shared/assets/emotions/emotionAssetUrls'
import { ModeToggleSlide } from '@renderer/shared/components/ModeToggleSlide'
import { SettingsPanel } from '@renderer/features/settings'
import { Button } from '@renderer/shared/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/shared/components/ui/popover'
import TrafficLights from '@renderer/shared/components/ui/traffic-lights'
import { cn } from '@renderer/shared/lib/utils'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import {
  invokeWindowClose,
  invokeWindowMaximize,
  invokeWindowMinimize
} from '@renderer/infrastructure/ipc'
import { getEmotionState } from '@renderer/infrastructure/persistence/EmotionStateRepository'
import { normalizeEmotionLabel, pickEmotionEmoji } from '@shared/emotion/emotionAssetCatalog'
import { useSheetStore } from '@renderer/features/chat/state/sheetStore'
import { PanelRight } from 'lucide-react'
import React, { useEffect, useState } from 'react'

const headerActionButtonClassName = [
  'app-undragable pointer-events-auto h-8 w-8 rounded-lg border border-transparent bg-transparent p-0',
  'text-slate-600 transition-[background-color,border-color,box-shadow,color,transform] duration-200',
  'hover:border-black/[0.08] hover:bg-black/[0.045] hover:text-slate-950 active:scale-95',
  'dark:text-(--chat-text-secondary) dark:hover:border-(--chat-border-standard)',
  'dark:hover:bg-(--chat-surface-hover) dark:hover:text-(--chat-text-primary)'
].join(' ')

export function useHeaderEmotion(): ChatEmotionState | undefined {
  const currentChatId = useChatStore(state => state.currentChatId)
  const [dbSnapshot, setDbSnapshot] = useState<ChatEmotionState>()

  useEffect(() => {
    let cancelled = false
    getEmotionState().then(snapshot => {
      if (cancelled) return
      if (!snapshot?.current) return
      const label = normalizeEmotionLabel(snapshot.current.label)
      if (!label) return
      setDbSnapshot({
        label,
        emoji: pickEmotionEmoji(label, snapshot.current.intensity),
        intensity: snapshot.current.intensity,
        source: 'computed'
      })
    }).catch(() => {
      // DB snapshot unavailable — fall through to undefined
    })
    return () => { cancelled = true }
  }, [])

  const transcriptEmotion = useChatStore(state => {
    const fromPreview = state.preview.message?.body?.emotion
    if (fromPreview?.label || fromPreview?.emoji) return fromPreview

    for (let i = state.messages.length - 1; i >= 0; i--) {
      const emotion = state.messages[i].body.emotion
      if (state.messages[i].body.role === 'assistant' && (emotion?.label || emotion?.emoji)) {
        return emotion
      }
    }
    return undefined
  })

  // Hide on welcome stage
  if (currentChatId === null || currentChatId === undefined) {
    return undefined
  }

  return transcriptEmotion ?? dbSnapshot
}

const ChatHeader: React.FC = () => {
  const chatTitle = useChatStore(state => state.chatTitle)
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const toggleArtifactsPanel = useChatStore(state => state.toggleArtifactsPanel)
  const { setSheetOpenState } = useSheetStore()
  const artifactsToggleLabel = artifactsPanelOpen
    ? 'Close artifacts panel'
    : 'Open artifacts panel'
  const emotion = useHeaderEmotion()
  const emotionAssetPack = useAppConfigStore(state => state.appConfig.emotion?.assetPack || 'default')
  const [assetFailed, setAssetFailed] = React.useState(false)
  const emotionAssetUrl = getEmotionAssetUrl(emotionAssetPack, emotion?.label, emotion?.intensity)
  const shouldRenderAsset = Boolean(emotionAssetUrl) && !assetFailed
  const emotionKey = `${emotion?.label || ''}:${emotion?.intensity ?? ''}:${emotion?.emoji || ''}`

  React.useEffect(() => {
    setAssetFailed(false)
  }, [emotionAssetUrl, emotion?.intensity, emotion?.emoji])

  return (
    <header
      className="header relative z-50 h-10 shrink-0 overflow-visible app-dragable"
      style={{ userSelect: 'none' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -bottom-2 bg-white/90 dark:bg-(--chat-header-surface) backdrop-blur-3xl"
        style={{
          WebkitMaskImage:
            'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)'
        }}
      />

      <div className="pointer-events-none relative z-10 grid h-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4">
        <div className="flex min-w-0 items-center gap-4 justify-self-start">
          <div className="app-undragable pointer-events-auto">
            <TrafficLights
              onClose={invokeWindowClose}
              onMinimize={invokeWindowMinimize}
              onMaximize={invokeWindowMaximize}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              className={headerActionButtonClassName}
              variant="ghost"
              onClick={() => { setSheetOpenState(true) }}
            >
              <ActivityLogIcon className="h-4 w-4" />
              <span className="sr-only">Open chat list</span>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  className={headerActionButtonClassName}
                  variant="ghost"
                >
                  <GearIcon className="h-4 w-4" />
                  <span className="sr-only">Open settings</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="app-undragable ml-1 mt-0.5 h-[93vh] w-[95vw] overflow-hidden rounded-2xl border border-border/60 bg-white p-2 shadow-2xl dark:border-(--app-border-standard) dark:bg-(--app-canvas) dark:text-(--app-text-body) dark:shadow-black/40">
                <SettingsPanel />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="min-w-0 justify-self-center px-3">
          <div className="group relative flex items-center gap-1.5 max-w-[min(34rem,42vw)] min-w-0 px-2">
            <AnimatePresence initial={false} mode="popLayout">
              {(emotion && (shouldRenderAsset || emotion.emoji)) && (
                <motion.span
                  key={emotionKey}
                  layout
                  initial={{ opacity: 0, scale: 0.78, x: -6, y: 2, rotate: -6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.84, x: 6, y: -1, rotate: 4, filter: 'blur(2px)' }}
                  transition={{
                    type: 'spring',
                    stiffness: 460,
                    damping: 28,
                    mass: 0.68
                  }}
                  className="app-undragable pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full"
                  aria-label={emotion.label ? `Current emotion: ${emotion.label}` : 'Current emotion'}
                  title={emotion.label ? `Current emotion: ${emotion.label}` : 'Current emotion'}
                >
                  {shouldRenderAsset ? (
                    <img
                      src={emotionAssetUrl}
                      alt=""
                      className="h-6 w-6 object-contain scale-[1.08]"
                      onError={() => setAssetFailed(true)}
                    />
                  ) : (
                    <span className="text-sm leading-none">{emotion.emoji}</span>
                  )}
                </motion.span>
              )}
            </AnimatePresence>
            <span className="block truncate py-1 text-sm font-semibold text-slate-600 dark:text-(--chat-text-primary)">
              {chatTitle}
            </span>
            <div className="absolute inset-x-0 bottom-0 h-px origin-center scale-x-75 bg-linear-to-r from-transparent via-blue-400/55 to-transparent opacity-80 transition-transform duration-300 group-hover:scale-x-100 dark:via-(--chat-accent)/45" />
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5 justify-self-end">
          <div className="app-undragable pointer-events-auto">
            <ModeToggleSlide triggerClassName={headerActionButtonClassName} />
          </div>
          <Button
            className={cn(
              headerActionButtonClassName,
              artifactsPanelOpen
                && 'border-black/[0.08] bg-black/[0.06] shadow-xs hover:bg-black/[0.08] dark:border-(--chat-border-standard) dark:bg-(--chat-surface-hover) dark:hover:bg-(--chat-surface-hover)'
            )}
            variant="ghost"
            onClick={toggleArtifactsPanel}
            aria-label={artifactsToggleLabel}
            aria-pressed={artifactsPanelOpen}
            title={artifactsToggleLabel}
          >
            <PanelRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  )
}

export default ChatHeader
