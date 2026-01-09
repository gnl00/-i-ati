import React, { useState, useEffect, useRef } from 'react'
import { cn } from '@renderer/lib/utils'

interface WelcomeMessageWithBlob2Props {
  className?: string
  onStart?: () => void
}

const WelcomeMessageWithBlob2: React.FC<WelcomeMessageWithBlob2Props> = ({ className, onStart }) => {
  const [typedText, setTypedText] = useState('')
  const fullText = "How can I help you today?"

  const hints = [
    "Ask me anything",
    "Upload a document to analyze",
    "Brainstorm ideas together",
    "Help me write",
    "Analyze and explain",
    "Creative thinking",
    "Translate text",
    "Solve problems"
  ]
  const [currentHint, setCurrentHint] = useState(0)
  const [hintFading, setHintFading] = useState(false)

  // Blob animation state
  const [mousePos, setMousePos] = useState({ x: 300, y: 300 })
  const [blob1Pos, setBlob1Pos] = useState({ x: 300, y: 300 })
  const [blob2Pos, setBlob2Pos] = useState({ x: 300, y: 300 })
  const [blob3Pos, setBlob3Pos] = useState({ x: 300, y: 300 })

  // Coordinated colors (complementary colors)
  const [baseHue, setBaseHue] = useState(Math.random() * 360)
  const blobColors = {
    blob1: baseHue,
    blob2: (baseHue + 120) % 360, // Triadic color harmony
    blob3: (baseHue + 240) % 360
  }

  // Blob scale animation
  const [blob1Scale, setBlob1Scale] = useState(1)
  const [blob2Scale, setBlob2Scale] = useState(1)
  const [blob3Scale, setBlob3Scale] = useState(1)

  // Initial animation
  const [isInitialAnimating, setIsInitialAnimating] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number>()

  // Typewriter effect
  useEffect(() => {
    let i = 0
    const typeInterval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i))
        i++
      } else {
        clearInterval(typeInterval)
      }
    }, 60)

    return () => clearInterval(typeInterval)
  }, [])

  // Initial animation - blobs expand from center
  useEffect(() => {
    setTimeout(() => {
      setIsInitialAnimating(false)
    }, 1000)
  }, [])

  // Hints rotation with fade effect
  useEffect(() => {
    const hintInterval = setInterval(() => {
      setHintFading(true)
      setTimeout(() => {
        setCurrentHint(prev => (prev + 1) % hints.length)
        setHintFading(false)
      }, 300)
    }, 3000)
    return () => clearInterval(hintInterval)
  }, [])

  // Coordinated color change - triadic harmony
  useEffect(() => {
    const colorInterval = setInterval(() => {
      setBaseHue(Math.random() * 360)
    }, 5000)
    return () => clearInterval(colorInterval)
  }, [])

  // Blob breathing animation (subtle scale)
  useEffect(() => {
    const breatheInterval = setInterval(() => {
      setBlob1Scale(0.95 + Math.random() * 0.1)
      setBlob2Scale(0.95 + Math.random() * 0.1)
      setBlob3Scale(0.95 + Math.random() * 0.1)
    }, 2000)
    return () => clearInterval(breatheInterval)
  }, [])

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        })
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('mousemove', handleMouseMove)
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove)
      }
    }
  }, [])

  // Smooth blob following animation
  useEffect(() => {
    const animate = () => {
      setBlob1Pos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.03,
        y: prev.y + (mousePos.y - prev.y) * 0.03
      }))

      setBlob2Pos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.02,
        y: prev.y + (mousePos.y - prev.y) * 0.02
      }))

      setBlob3Pos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.025,
        y: prev.y + (mousePos.y - prev.y) * 0.025
      }))

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [mousePos])

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
        {/* Blob 1 - Small sphere with optimizations */}
        <div
          className="absolute"
          style={{
            transform: `translate(${blob1Pos.x}px, ${blob1Pos.y}px) translate(-50%, -50%) scale(${isInitialAnimating ? 0 : blob1Scale})`,
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: `hsl(${blobColors.blob1}, 70%, 65%)`,
            boxShadow: '10px 10px 5px 0px rgba(0, 0, 0, 0.3)',
            opacity: 0.6,
            willChange: 'transform',
            transition: 'background 3s ease, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '15px',
              left: '15px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.8)'
            }}
          />
        </div>

        {/* Blob 2 - Large sphere with optimizations */}
        <div
          className="absolute"
          style={{
            transform: `translate(${blob2Pos.x}px, ${blob2Pos.y}px) translate(-50%, -50%) scale(${isInitialAnimating ? 0 : blob2Scale})`,
            width: '125px',
            height: '125px',
            borderRadius: '50%',
            background: `hsl(${blobColors.blob2}, 70%, 65%)`,
            boxShadow: '10px 10px 5px 0px rgba(0, 0, 0, 0.3)',
            opacity: 0.6,
            willChange: 'transform',
            transition: 'background 3s ease, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '35px',
              left: '35px',
              width: '35px',
              height: '35px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.8)'
            }}
          />
        </div>

        {/* Blob 3 - Medium sphere with optimizations */}
        <div
          className="absolute"
          style={{
            transform: `translate(${blob3Pos.x}px, ${blob3Pos.y}px) translate(-50%, -50%) scale(${isInitialAnimating ? 0 : blob3Scale})`,
            width: '75px',
            height: '75px',
            borderRadius: '50%',
            background: `hsl(${blobColors.blob3}, 70%, 65%)`,
            boxShadow: '10px 10px 5px 0px rgba(0, 0, 0, 0.3)',
            opacity: 0.6,
            willChange: 'transform',
            transition: 'background 3s ease, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '25px',
              left: '25px',
              width: '25px',
              height: '25px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.8)'
            }}
          />
        </div>
      </div>

      {/* Subtle background texture */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]">
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

          {/* Title with typewriter effect */}
          <div className="text-center space-y-6 animate-fade-in">
            <h1 className="text-5xl md:text-6xl font-light text-foreground tracking-tight">
              <span className="inline-block min-h-[1.2em]">
                {typedText}
                <span className="animate-pulse">|</span>
              </span>
            </h1>
          </div>

          {/* Subtitle */}
          <p className="text-center text-lg text-muted-foreground font-light max-w-xl animate-fade-in-delayed">
            Ask me a question or share what you're working on.
          </p>

          {/* CTA Button */}
          <div className="animate-slide-up">
            <button
              onClick={onStart}
              className="group relative px-12 py-4 bg-primary text-primary-foreground rounded-full font-medium text-lg hover:bg-primary/90 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            >
              <span className="relative flex items-center gap-3">
                <svg
                  className="w-5 h-5 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                Start a conversation
              </span>
            </button>
          </div>

          {/* Helpful hints with fade effect */}
          <div className="animate-fade-in-delayed-2 pt-8">
            <p className={cn(
              "text-center text-sm text-muted-foreground font-light transition-opacity duration-300",
              hintFading ? "opacity-0" : "opacity-100"
            )}>
              {hints[currentHint]}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-delayed {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-delayed-2 {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-fade-in-delayed {
          animation: fade-in-delayed 0.6s ease-out 0.2s both;
        }

        .animate-slide-up {
          animation: slide-up 0.6s ease-out 0.4s both;
        }

        .animate-fade-in-delayed-2 {
          animation: fade-in-delayed-2 0.6s ease-out 0.6s both;
        }

        .animate-pulse {
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

export default WelcomeMessageWithBlob2
