import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getEmotionAssetUrl } from '@renderer/assets/emotions/emotionAssetUrls'
import { cn } from '@renderer/lib/utils'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { ModelBadgeNextIcon } from './ModelBadgeNextIcon'

interface ModelBadgeNextProps {
  model: string
  provider?: string
  animate?: boolean
  emotionLabel?: string
  emotionEmoji?: string
  emotionIntensity?: number
}

export const ModelBadgeNext: React.FC<ModelBadgeNextProps> = ({
  model,
  provider,
  animate = false,
  emotionLabel,
  emotionEmoji,
  emotionIntensity
}) => {
  const emotionAssetPack = useAppConfigStore(state => state.appConfig.emotion?.assetPack || 'default')
  const [assetFailed, setAssetFailed] = React.useState(false)
  const emotionAssetUrl = getEmotionAssetUrl(emotionAssetPack, emotionLabel, emotionIntensity)
  const shouldRenderAsset = Boolean(emotionAssetUrl) && !assetFailed
  const emotionKey = `${emotionLabel || ''}:${emotionIntensity || ''}:${emotionEmoji || ''}`

  React.useEffect(() => {
    setAssetFailed(false)
  }, [emotionAssetUrl, emotionIntensity, emotionEmoji])

  return (
    <div
      id="model-badge"
      className={cn(
        'inline-flex max-w-full items-center gap-2.5 mb-2 px-2.5 py-1.25 rounded-2xl',
        'select-none tracking-tight',
        'bg-linear-to-r from-slate-100/92 via-white/84 to-slate-100/88',
        'dark:from-slate-900/64 dark:via-slate-900/48 dark:to-slate-900/60',
        'shadow-[0_12px_30px_-22px_rgba(15,23,42,0.42)]',
        'backdrop-blur-md'
      )}
    >
      <ModelBadgeNextIcon provider={provider} model={model} animate={animate} />

      <span className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-100 uppercase">
        {model}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        {(shouldRenderAsset || emotionEmoji) && (
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
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full',
              'origin-center will-change-transform'
            )}
            aria-label="emotion"
            title={emotionLabel ? `Current emotion: ${emotionLabel}` : 'Current emotion'}
          >
            {shouldRenderAsset ? (
              <img
                src={emotionAssetUrl}
                alt=""
                aria-hidden="true"
                className="h-6 w-6 object-contain scale-[1.08]"
                onError={() => setAssetFailed(true)}
              />
            ) : (
              <span className="text-sm leading-none">{emotionEmoji}</span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
