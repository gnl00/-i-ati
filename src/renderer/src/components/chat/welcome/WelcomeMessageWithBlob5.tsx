import React, { useState, useEffect, useRef, useCallback } from 'react'
import { animated, useTrail } from '@react-spring/web'
import { cn } from '@renderer/lib/utils'
import './WelcomeMessageWithBlob3.css'

// ============================================================================
// Constants
// ============================================================================
const CONFIG = {
  BLOB_SIZE_SMALL: 60,
  BLOB_SIZE_MEDIUM: 75,
  BLOB_SIZE_LARGE: 125,

  COLOR_CHANGE_INTERVAL: 5000,
  BREATHE_INTERVAL: 2000,
  HINT_CHANGE_INTERVAL: 3000,
  HINT_FADE_DURATION: 300,
  TYPEWRITER_SPEED: 60,

  MOUSE_THROTTLE_MS: 16, // ~60fps

  BUTTON_HIDE_DURATION: 300,
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
interface WelcomeMessageWithBlob5Props {
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
// Main Component
// ============================================================================
const WelcomeMessageWithBlob5: React.FC<WelcomeMessageWithBlob5Props> = ({
  className,
  onStart
}) => {
  // ============================================================================
  // Text State
  // ============================================================================
  const [typedText, setTypedText] = useState('')
  const fullText = "How can I help you today?"
  const [currentHint, setCurrentHint] = useState(0)
  const [hintFading, setHintFading] = useState(false)

  // ============================================================================
  // Animation State
  // ============================================================================
  const [isInitialAnimating, setIsInitialAnimating] = useState(true)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ============================================================================
  // Blob Animation State
  // ============================================================================
  const [blobTrail, blobApi] = useTrail(3, i => ({
    xy: [300, 300],
    scale: 1,
    config:
      i === 0 ? { tension: 120, friction: 14 } :
      i === 1 ? { mass: 10, tension: 80, friction: 20 } :
      { mass: 5, tension: 100, friction: 17 }
  }))

  // ============================================================================
  // Color State (triadic harmony)
  // ============================================================================
  const [baseHue, setBaseHue] = useState(() => Math.random() * 360)
  const blobHues = [
    baseHue,
    (baseHue + 120) % 360,
    (baseHue + 240) % 360
  ]

  // ============================================================================
  // Refs for RAF throttling
  // ============================================================================
  const rafRef = useRef<number>()
  const lastMousePosRef = useRef<[number, number]>([300, 300])

  // ============================================================================
  // Mouse Tracking with RAF Throttling
  // ============================================================================
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

  // ============================================================================
  // Unified Animation Loop (merges 4 separate useEffects)
  // ============================================================================
  useEffect(() => {
    // Initial animation timeout
    const initialTimeout = setTimeout(() => {
      setIsInitialAnimating(false)
    }, 1000)

    // Unified animation loop for color, breathe, hints
    let frameCount = 0
    const animationLoop = setInterval(() => {
      frameCount++

      // Color change every 5s
      if (frameCount % (CONFIG.COLOR_CHANGE_INTERVAL / CONFIG.MOUSE_THROTTLE_MS) === 0) {
        setBaseHue(Math.random() * 360)
      }

      // Hint rotation every 3s
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

  // ============================================================================
  // Blob Breathe Animation (separate for better spring control)
  // ============================================================================
  useEffect(() => {
    const breatheInterval = setInterval(() => {
      blobApi.start(i => ({
        scale: 0.95 + Math.random() * 0.1
      }))
    }, CONFIG.BREATHE_INTERVAL)

    return () => clearInterval(breatheInterval)
  }, [blobApi])

  // ============================================================================
  // Typewriter Effect (separate as it only runs once)
  // ============================================================================
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

  // ============================================================================
  // Button Click Handler (simplified - just hide and callback)
  // ============================================================================
  const handleButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    console.log('[Button Click] Starting conversation')

    if (buttonRef.current) {
      buttonRef.current.style.transition = `opacity ${CONFIG.BUTTON_HIDE_DURATION}ms ease-out, transform ${CONFIG.BUTTON_HIDE_DURATION}ms ease-out`
      buttonRef.current.style.opacity = '0'
      buttonRef.current.style.transform = 'scale(0.9)'
      buttonRef.current.style.pointerEvents = 'none'
    }

    // Call onStart after a short delay for the animation
    setTimeout(() => {
      onStart?.()
    }, CONFIG.BUTTON_HIDE_DURATION)
  }, [onStart])

  // ============================================================================
  // Render
  // ============================================================================
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

          <div className="animate-slide-up">
            <button
              ref={buttonRef}
              onClick={handleButtonClick}
              className="group relative px-12 py-4 bg-primary text-primary-foreground rounded-full font-medium text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <span className="relative flex items-center gap-3">
                <svg className="w-5 h-5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Start a conversation
              </span>
            </button>
          </div>

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

export default WelcomeMessageWithBlob5
