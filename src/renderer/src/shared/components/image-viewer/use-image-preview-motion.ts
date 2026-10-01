import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

function getImageRect(
  image: HTMLImageElement,
  box: DOMRect,
): { left: number; top: number; width: number; height: number } | null {
  if (!image.naturalWidth || !image.naturalHeight || !box.width || !box.height)
    return null
  const scale = Math.min(
    box.width / image.naturalWidth,
    box.height / image.naturalHeight,
  )
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  }
}

export interface ImagePreviewSource {
  element: HTMLButtonElement | null
  viewport?: { top: number; right: number; bottom: number; left: number }
  fadeOnClose?: boolean
}

export function useImagePreviewMotion(
  urls: string[],
  getSource: (index: number) => ImagePreviewSource,
): {
  previewIndex: number | null
  phase: 'opening' | 'open' | 'closing'
  imageRef: React.RefObject<HTMLImageElement | null>
  overlayRef: React.RefObject<HTMLDivElement | null>
  chromeRef: React.RefObject<HTMLDivElement | null>
  open: (index: number, animate: boolean) => void
  close: (animate: boolean) => void
  switchImage: (index: number, animate: boolean) => void
  onImageLoad: () => void
  onOpenReady: () => void
  restoreFocus: () => void
} {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('open')
  const imageRef = useRef<HTMLImageElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const animationsRef = useRef<Animation[]>([])
  const revisionRef = useRef(0)
  const focusTargetRef = useRef<HTMLButtonElement | null>(null)
  const enteredImageRef = useRef(false)
  const entryMotionRef = useRef(false)
  const switchMotionRef = useRef(false)
  const closingRef = useRef(false)

  const canAnimate = (): boolean =>
    typeof imageRef.current?.animate === 'function' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const cancel = (): void => {
    revisionRef.current += 1
    animationsRef.current.forEach((animation) => animation.cancel())
    animationsRef.current = []
  }
  const animateNode = (
    node: HTMLElement | null,
    frames: Keyframe[],
    duration: number,
    delay = 0,
  ): Animation | undefined => {
    if (!node || typeof node.animate !== 'function') return
    const animation = node.animate(frames, {
      duration,
      delay,
      easing: EASING,
      fill: 'both',
    })
    animationsRef.current.push(animation)
    return animation
  }
  const animateChrome = (to: number, duration: number, delay = 0): void => {
    const controls = chromeRef.current
      ?.closest('[role="dialog"]')
      ?.querySelectorAll<HTMLElement>('[data-image-preview-control]')
    controls?.forEach((node) =>
      animateNode(
        node,
        [
          { opacity: to === 1 ? 0 : window.getComputedStyle(node).opacity },
          { opacity: to },
        ],
        duration,
        delay,
      ),
    )
  }
  const onFinished = (
    animation: Animation | undefined,
    callback: () => void,
  ): void => {
    const revision = revisionRef.current
    if (!animation) {
      callback()
      return
    }
    void animation.finished
      .then(() => {
        if (revision === revisionRef.current) callback()
      })
      .catch(() => undefined)
  }
  const targetTransform = (index: number): string | null => {
    const image = imageRef.current
    const { element: thumbnail, viewport } = getSource(index)
    if (!image || !thumbnail?.isConnected) return null
    const targetImage = thumbnail.querySelector('img')
    if (!targetImage) return null
    const targetBox = targetImage.getBoundingClientRect()
    if (
      targetBox.left < Math.max(0, viewport?.left ?? 0) ||
      targetBox.right >
        Math.min(window.innerWidth, viewport?.right ?? window.innerWidth) ||
      targetBox.top < Math.max(0, viewport?.top ?? 0) ||
      targetBox.bottom >
        Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight)
    )
      return null
    const target = getImageRect(image, targetBox)
    const current = getImageRect(image, image.getBoundingClientRect())
    if (!target || !current) return null
    return `translate(${target.left - current.left}px, ${target.top - current.top}px) scale(${target.width / current.width})`
  }
  const onImageLoad = (): void => {
    const image = imageRef.current
    if (!image || previewIndex === null || closingRef.current || !canAnimate())
      return
    if (switchMotionRef.current) {
      switchMotionRef.current = false
      animateNode(image, [{ opacity: 0 }, { opacity: 1 }], 120)
    } else if (entryMotionRef.current && !enteredImageRef.current) {
      enteredImageRef.current = true
      const transform = targetTransform(previewIndex)
      animateNode(
        image,
        transform
          ? [
              { transform, opacity: 1 },
              { transform: 'none', opacity: 1 },
            ]
          : [{ opacity: 0 }, { opacity: 1 }],
        transform ? 220 : 120,
      )
    }
  }

  const onOpenReady = (): void => {
    if (previewIndex === null || phase !== 'opening') return
    if (!canAnimate()) {
      entryMotionRef.current = false
      setPhase('open')
      return
    }
    const overlay = animateNode(
      overlayRef.current,
      [{ opacity: 0 }, { opacity: 1 }],
      220,
    )
    animateChrome(1, 120, 100)
    onFinished(overlay, () => setPhase('open'))
    if (imageRef.current?.complete) onImageLoad()
  }

  useLayoutEffect(() => {
    if (switchMotionRef.current && imageRef.current?.complete) onImageLoad()
  }, [previewIndex])

  const previousUrlsRef = useRef(urls)
  useEffect(() => {
    if (
      urls.length === previousUrlsRef.current.length &&
      urls.every((url, index) => url === previousUrlsRef.current[index])
    )
      return
    previousUrlsRef.current = urls
    cancel()
    closingRef.current = false
    entryMotionRef.current = false
    switchMotionRef.current = false
    setPreviewIndex(null)
    setPhase('open')
  }, [urls])

  useEffect(() => (): void => cancel(), [])
  useEffect(() => {
    if (previewIndex === null) return
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const settle = (): void => {
      cancel()
      entryMotionRef.current = false
      switchMotionRef.current = false
      if (closingRef.current) setPreviewIndex(null)
      setPhase('open')
    }
    const onPreferenceChange = (): void => {
      if (media?.matches) settle()
    }
    window.addEventListener('resize', settle)
    media?.addEventListener('change', onPreferenceChange)
    return (): void => {
      window.removeEventListener('resize', settle)
      media?.removeEventListener('change', onPreferenceChange)
    }
  }, [previewIndex])

  return {
    previewIndex,
    phase,
    imageRef,
    overlayRef,
    chromeRef,
    onImageLoad,
    onOpenReady,
    open(index, shouldAnimate): void {
      cancel()
      closingRef.current = false
      enteredImageRef.current = false
      switchMotionRef.current = false
      entryMotionRef.current = shouldAnimate
      focusTargetRef.current = getSource(index).element
      setPhase(shouldAnimate ? 'opening' : 'open')
      setPreviewIndex(index)
    },
    close(shouldAnimate): void {
      if (previewIndex === null || closingRef.current) return
      closingRef.current = true
      entryMotionRef.current = false
      focusTargetRef.current = getSource(previewIndex).element
      const image = imageRef.current
      const imageStyle = image ? window.getComputedStyle(image) : null
      const fromTransform = imageStyle?.transform || 'none'
      const fromOpacity = imageStyle?.opacity ?? '1'
      const overlayOpacity = overlayRef.current
        ? window.getComputedStyle(overlayRef.current).opacity
        : '1'
      const controlOpacities = new Map<HTMLElement, string>()
      chromeRef.current
        ?.closest('[role="dialog"]')
        ?.querySelectorAll<HTMLElement>('[data-image-preview-control]')
        .forEach((node) =>
          controlOpacities.set(node, window.getComputedStyle(node).opacity),
        )
      const animate = shouldAnimate && canAnimate()
      cancel()
      if (!animate) {
        setPreviewIndex(null)
        return
      }
      const transform = targetTransform(previewIndex)
      const duration = transform ? 180 : 120
      const movement = animateNode(
        image,
        [
          { transform: fromTransform, opacity: fromOpacity },
          {
            transform: transform ?? fromTransform,
            opacity: transform && !getSource(previewIndex).fadeOnClose ? 1 : 0,
          },
        ],
        duration,
      )
      controlOpacities.forEach((opacity, node) =>
        animateNode(node, [{ opacity }, { opacity: 0 }], 100),
      )
      const overlay = animateNode(
        overlayRef.current,
        [{ opacity: overlayOpacity }, { opacity: 0 }],
        duration,
      )
      setPhase('closing')
      onFinished(movement ?? overlay, () => {
        cancel()
        setPreviewIndex(null)
      })
    },
    switchImage(index, shouldAnimate): void {
      if (closingRef.current) return
      cancel()
      entryMotionRef.current = false
      switchMotionRef.current = shouldAnimate
      setPhase('open')
      setPreviewIndex(index)
    },
    restoreFocus(): void {
      focusTargetRef.current?.focus({ preventScroll: true })
    },
  }
}
