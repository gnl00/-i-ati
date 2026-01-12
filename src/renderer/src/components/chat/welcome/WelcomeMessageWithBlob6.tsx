import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSpring, animated, useTrail } from '@react-spring/web'
import { cn } from '@renderer/lib/utils'
import './WelcomeMessageWithBlob3.css'

// ============================================================================
// Constants
// ============================================================================
const CONFIG = {
  BLOB_SIZE_SMALL: 60,
  BLOB_SIZE_MEDIUM: 75,
  BLOB_SIZE_LARGE: 125,
  BUTTON_BLOB_SIZE: 100,

  COLOR_CHANGE_INTERVAL: 5000,
  BREATHE_INTERVAL: 2000,
  HINT_CHANGE_INTERVAL: 3000,
  HINT_FADE_DURATION: 300,
  TYPEWRITER_SPEED: 60,

  MOUSE_THROTTLE_MS: 16,

  BUTTON_FADE_DURATION: 300,
  BUTTON_BLOB_APPEAR_DURATION: 400,
  BUTTON_BLOB_MORPH_DURATION: 1500,
  BUTTON_BLOB_MORPH_INTERVAL: 300,
} as const

const BLOB_CONFIGS = [
  { id: 1, size: CONFIG.BLOB_SIZE_SMALL, highlightSize: 20, highlightTop: 15, highlightLeft: 15 },
  { id: 2, size: CONFIG.BLOB_SIZE_MEDIUM, highlightSize: 25, highlightTop: 25, highlightLeft: 25 },
  { id: 3, size: CONFIG.BLOB_SIZE_LARGE, highlightSize: 35, highlightTop: 35, highlightLeft: 35 },
] as const

const HINTS = [
  "Ask me anything",
  "Upload a document to analyze",
  "Brainstorm ideas together",
  "Help me write",
  "Analyze and explain",
  "Creative thinking",
  "Translate text",
  "Solve problems"
] as const

// ============================================================================
// Types
// ============================================================================
interface WelcomeMessageWithBlob6Props {
  className?: string
  onStart?: () => void
}

interface BlobConfig {
  id: number
  size: number
  highlightSize: number
  highlightTop: number
  highlightLeft: number
}

// ============================================================================
// Blob Component
// ============================================================================
interface BlobProps {
  config: BlobConfig
  hue: number
  xy: animated.SpringValue<[number, number]>
  scale: animated.SpringValue<number>
  isInitialAnimating: boolean
}

const Blob: React.FC<BlobProps> = ({ config, hue, xy, scale, isInitialAnimating }) => {
  const trans = useCallback((x: number, y: number) =>
    `translate3d(${x}px, ${y}px, 0) translate3d(-50%, -50%, 0)`,
  [])

  return (
    <animated.div
      className="absolute"
      style={{
        width: `${config.size}px`,
        height: `${config.size}px`,
        borderRadius: '50%',
        background: `hsl(${hue}, 70%, 65%)`,
        boxShadow: '10px 10px 5px 0px rgba(0, 0, 0, 0.3)',
        opacity: 0.6,
        willChange: 'transform',
        transition: 'background 3s ease',
        transform: xy.to(trans),
        scale: scale.to(s => isInitialAnimating ? 0 : s)
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: `${config.highlightTop}px`,
          left: `${config.highlightLeft}px`,
          width: `${config.highlightSize}px`,
          height: `${config.highlightSize}px`,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.8)'
        }}
      />
    </animated.div>
  )
}

// ============================================================================
// ButtonBlob Component (按钮变成的不规则 blob)
// ============================================================================
interface ButtonBlobProps {
  position: { x: number; y: number }
  hue: number
  spring: {
    scale: animated.SpringValue<number>
    opacity: animated.SpringValue<number>
  }
  blobRef: React.RefObject<HTMLDivElement>
}

const ButtonBlob: React.FC<ButtonBlobProps> = ({ position, hue, spring, blobRef }) => {
  const scaleValue = spring.scale.get()
  const opacityValue = spring.opacity.get()
  console.log('[ButtonBlob] Rendering with:', {
    position,
    hue,
    scale: scaleValue,
    opacity: opacityValue
  })

  return (
    <animated.div
      ref={blobRef}
      className="absolute"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${CONFIG.BUTTON_BLOB_SIZE}px`,
        height: `${CONFIG.BUTTON_BLOB_SIZE}px`,
        borderRadius: '50%',
        background: `hsl(${hue}, 70%, 65%)`,
        boxShadow: '10px 10px 5px 0px rgba(0, 0, 0, 0.3)',
        opacity: spring.opacity,
        willChange: 'transform',
        transform: `translate3d(${position.x}px, ${position.y}px, 0) translate3d(-50%, -50%, 0)`,
        scale: spring.scale
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '30px',
          left: '30px',
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.8)'
        }}
      />
    </animated.div>
  )
}

// ============================================================================
// Main Component
// ============================================================================
const WelcomeMessageWithBlob6: React.FC<WelcomeMessageWithBlob6Props> = ({
  className,
  onStart
}) => {
  // Text State
  const [typedText, setTypedText] = useState('')
  const fullText = "How can I help you today?"
  const [currentHint, setCurrentHint] = useState(0)
  const [hintFading, setHintFading] = useState(false)

  // Animation State
  const [isInitialAnimating, setIsInitialAnimating] = useState(true)
  const [buttonVisible, setButtonVisible] = useState(true)
  const [buttonBlobVisible, setButtonBlobVisible] = useState(false)
  const [buttonBlobPosition, setButtonBlobPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Blob Animation State
  const [blobTrail, blobApi] = useTrail(3, i => ({
    xy: [300, 300],
    scale: 1,
    config:
      i === 0 ? { tension: 120, friction: 14 } :
      i === 1 ? { mass: 10, tension: 80, friction: 20 } :
      { mass: 5, tension: 100, friction: 17 }
  }))

  // Button Blob Animation
  const [buttonBlobSpring, buttonBlobApi] = useSpring(() => ({
    scale: 0,
    opacity: 0,
    config: { tension: 200, friction: 20 }
  }))

  // Button Blob border radius ref (use ref to avoid re-renders)
  const buttonBlobBorderRadiusRef = useRef('50%')
  const buttonBlobRef = useRef<HTMLDivElement>(null)

  // Color State
  const [baseHue, setBaseHue] = useState(() => Math.random() * 360)
  const blobHues = [
    baseHue,
    (baseHue + 120) % 360,
    (baseHue + 240) % 360
  ]

  // RAF throttling
  const rafRef = useRef<number>()
  const lastMousePosRef = useRef<[number, number]>([300, 300])

  // Generate random border radius for irregular shape
  const generateRandomBorderRadius = useCallback((): string => {
    const r1 = 40 + Math.random() * 30
    const r2 = 40 + Math.random() * 30
    const r3 = 40 + Math.random() * 30
    const r4 = 40 + Math.random() * 30
    const r5 = 40 + Math.random() * 30
    const r6 = 40 + Math.random() * 30
    const r7 = 40 + Math.random() * 30
    const r8 = 40 + Math.random() * 30
    return `${r1}% ${r2}% ${r3}% ${r4}% / ${r5}% ${r6}% ${r7}% ${r8}%`
  }, [])

  // Button Click Handler
  const handleButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    console.log('[Button Click] Starting animation')

    // Get button position relative to container
    const buttonRect = buttonRef.current?.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!buttonRect || !containerRect) return

    const buttonCenterX = buttonRect.left - containerRect.left + buttonRect.width / 2
    const buttonCenterY = buttonRect.top - containerRect.top + buttonRect.height / 2

    console.log('[Button Click] Button position:', { x: buttonCenterX, y: buttonCenterY })
    setButtonBlobPosition({ x: buttonCenterX, y: buttonCenterY })

    // Step 1: Fade out button
    if (buttonRef.current) {
      buttonRef.current.style.transition = `opacity ${CONFIG.BUTTON_FADE_DURATION}ms ease-out`
      buttonRef.current.style.opacity = '0'
    }

    setTimeout(() => {
      setButtonVisible(false)
      setButtonBlobVisible(true)
      console.log('[Button Click] Button blob visible')

      // Step 2: Button blob appears - use setTimeout to ensure state update completes
      setTimeout(() => {
        console.log('[Button Click] Starting blob animation')
        buttonBlobApi.start({
          scale: 1,
          opacity: 0.6,
          config: { tension: 300, friction: 20 }
        })

        // Step 3: Start morphing after animation completes
        setTimeout(() => {
          let morphCount = 0
          const maxMorphs = Math.floor(CONFIG.BUTTON_BLOB_MORPH_DURATION / CONFIG.BUTTON_BLOB_MORPH_INTERVAL)

          const morphInterval = setInterval(() => {
            morphCount++
            console.log('[Button Blob] Morphing:', morphCount)

            if (morphCount <= maxMorphs) {
              // Directly update DOM to avoid re-renders
              if (buttonBlobRef.current) {
                buttonBlobRef.current.style.borderRadius = generateRandomBorderRadius()
              }
            } else {
              clearInterval(morphInterval)

              // Step 4: Fade out and call onStart
              setTimeout(() => {
                buttonBlobApi.start({
                  scale: 0,
                  opacity: 0,
                  config: { duration: CONFIG.BUTTON_FADE_DURATION }
                })

                setTimeout(() => {
                  console.log('[Button Blob] Animation complete')
                  onStart?.()
                }, CONFIG.BUTTON_FADE_DURATION)
              }, 300)
            }
          }, CONFIG.BUTTON_BLOB_MORPH_INTERVAL)
        }, 400)
      }, 50)
    }, CONFIG.BUTTON_FADE_DURATION)
  }, [buttonBlobApi, generateRandomBorderRadius, onStart])

  // Mouse Tracking
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    lastMousePosRef.current = [x, y]

    if (rafRef.current) return

    rafRef.current = requestAnimationFrame(() => {
      blobApi.start({ xy: lastMousePosRef.current })
      rafRef.current = undefined
    })
  }, [blobApi])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('mousemove', handleMouseMove)
    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [handleMouseMove])

  // Unified Animation Loop
  useEffect(() => {
    const initialTimeout = setTimeout(() => {
      setIsInitialAnimating(false)
    }, 1000)

    let frameCount = 0
    const animationLoop = setInterval(() => {
      frameCount++

      if (frameCount % (CONFIG.COLOR_CHANGE_INTERVAL / CONFIG.MOUSE_THROTTLE_MS) === 0) {
        setBaseHue(Math.random() * 360)
      }

      if (frameCount % (CONFIG.HINT_CHANGE_INTERVAL / CONFIG.MOUSE_THROTTLE_MS) === 0) {
        setHintFading(true)
        setTimeout(() => {
          setCurrentHint(prev => (prev + 1) % HINTS.length)
          setHintFading(false)
        }, CONFIG.HINT_FADE_DURATION)
      }
    }, CONFIG.MOUSE_THROTTLE_MS)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(animationLoop)
    }
  }, [])

  // Blob Breathe Animation
  useEffect(() => {
    const breatheInterval = setInterval(() => {
      blobApi.start(i => ({
        scale: 0.95 + Math.random() * 0.1
      }))
    }, CONFIG.BREATHE_INTERVAL)

    return () => clearInterval(breatheInterval)
  }, [blobApi])

  // Typewriter Effect
  useEffect(() => {
    let i = 0
    const typeInterval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i))
        i++
      } else {
        clearInterval(typeInterval)
      }
    }, CONFIG.TYPEWRITER_SPEED)

    return () => clearInterval(typeInterval)
  }, [])

  // Render
  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-[70vh] flex items-center justify-center overflow-hidden",
        className
      )}
    >
      {/* SVG Filter for goo effect */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="20" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
          </filter>
        </defs>
      </svg>

      {/* Blob container with goo filter */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ filter: 'url(#goo)' }}
      >
        {BLOB_CONFIGS.map((config, i) => (
          <Blob
            key={config.id}
            config={config}
            hue={blobHues[i]}
            xy={blobTrail[i].xy}
            scale={blobTrail[i].scale}
            isInitialAnimating={isInitialAnimating}
          />
        ))}

        {/* Button Blob - 按钮变成的不规则 blob */}
        {buttonBlobVisible && (
          <ButtonBlob
            position={buttonBlobPosition}
            hue={(baseHue + 180) % 360}
            spring={buttonBlobSpring}
            blobRef={buttonBlobRef}
          />
        )}
      </div>

      {/* Subtle background texture */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04] pointer-events-none">
        <div className="w-full h-full" style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-3xl px-8">
        <div className="flex flex-col items-center justify-center space-y-16">
          <div className="text-center space-y-6 animate-fade-in">
            <h1 className="text-5xl md:text-6xl font-light text-foreground tracking-tight">
              <span className="inline-block min-h-[1.2em]">
                {typedText}
                <span className="animate-pulse">|</span>
              </span>
            </h1>
          </div>

          <p className="text-center text-lg text-muted-foreground font-light max-w-xl animate-fade-in-delayed">
            Ask me a question or share what you're working on.
          </p>

          {/* Button */}
          {buttonVisible && (
            <div className="animate-slide-up">
              <button
                ref={buttonRef}
                onClick={handleButtonClick}
                className="group relative px-12 py-4 bg-primary text-primary-foreground rounded-full font-medium text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
              >
                <span className="relative flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Start a conversation
                </span>
              </button>
            </div>
          )}

          <div className="animate-fade-in-delayed-2 pt-8">
            <p className={cn("text-center text-sm text-muted-foreground font-light transition-opacity duration-300", hintFading ? "opacity-0" : "opacity-100")}>
              {HINTS[currentHint]}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WelcomeMessageWithBlob6
