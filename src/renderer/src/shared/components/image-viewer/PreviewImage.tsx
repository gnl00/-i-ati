import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@renderer/shared/lib/utils'

export function PreviewImage({
  src,
  alt,
  imageRef,
  onReady,
  className,
  style,
}: {
  src: string
  alt: string
  imageRef?: React.Ref<HTMLImageElement>
  onReady?: () => void
  className?: string
  style?: React.CSSProperties
}): React.ReactElement {
  const [failed, setFailed] = useState(false)

  return failed ? (
    <span
      role="img"
      aria-label={`${alt}: unavailable`}
      className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-[11px] text-(--app-text-secondary)"
    >
      <ImageOff aria-hidden="true" className="h-4 w-4 shrink-0" />
      Image unavailable
    </span>
  ) : (
    <img
      ref={imageRef}
      src={src}
      alt={alt}
      onLoad={onReady}
      onError={() => {
        setFailed(true)
        onReady?.()
      }}
      className={cn('h-full w-full object-contain', className)}
      style={style}
    />
  )
}
