import React, { useState, useEffect, useRef } from 'react'
import { cn } from '@renderer/lib/utils'

interface WelcomeMessageWithBlobProps {
  className?: string
  onStart?: () => void
}

const WelcomeMessageWithBlob: React.FC<WelcomeMessageWithBlobProps> = ({ className, onStart }) => {
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

  // Blob animation state
  const [mousePos, setMousePos] = useState({ x: 300, y: 300 })
  const [blob1Pos, setBlob1Pos] = useState({ x: 300, y: 300 })
  const [blob2Pos, setBlob2Pos] = useState({ x: 300, y: 300 })
  const [blob3Pos, setBlob3Pos] = useState({ x: 300, y: 300 })
  const [blobColors, setBlobColors] = useState({
    blob1: { h: 240, s: 70, l: 60 }, // indigo
    blob2: { h: 260, s: 70, l: 60 }, // violet
    blob3: { h: 280, s: 70, l: 60 }  // purple
  })
  const [isButtonMelting, setIsButtonMelting] = useState(false)
  const [meltingDrops, setMeltingDrops] = useState<Array<{ id: number; delay: number }>>([])
  const [showBottomLiquid, setShowBottomLiquid] = useState(false)
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

  // Hints rotation
  useEffect(() => {
    const hintInterval = setInterval(() => {
      setCurrentHint(prev => (prev + 1) % hints.length)
    }, 3000)
    return () => clearInterval(hintInterval)
  }, [])

  // Mouse tracking with color change
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        setMousePos({ x, y })

        // Change colors based on mouse position - wider range
        const hueShift = (x / rect.width) * 180 // 0-180 degree shift for more colors
        const saturationShift = 60 + (y / rect.height) * 20 // 60-80% saturation

        setBlobColors({
          blob1: { h: 180 + hueShift, s: saturationShift, l: 60 }, // cyan to red
          blob2: { h: 240 + hueShift, s: saturationShift, l: 60 }, // blue to orange
          blob3: { h: 300 + hueShift, s: saturationShift, l: 60 }  // magenta to yellow
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
      // Blob 1: Fast follower
      setBlob1Pos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.15,
        y: prev.y + (mousePos.y - prev.y) * 0.15
      }))

      // Blob 2: Slow follower
      setBlob2Pos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.08,
        y: prev.y + (mousePos.y - prev.y) * 0.08
      }))

      // Blob 3: Medium follower
      setBlob3Pos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.12,
        y: prev.y + (mousePos.y - prev.y) * 0.12
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
        {/* Blob 1 - Small, fast, irregular liquid shape */}
        <div
          className="absolute"
          style={{
            transform: `translate(${blob1Pos.x}px, ${blob1Pos.y}px) translate(-50%, -50%)`,
            width: '100px',
            height: '100px'
          }}
        >
          <svg width="100" height="100" viewBox="0 0 100 100">
            <path
              d="M50,10 C65,12 75,20 80,35 C85,50 82,65 70,75 C58,85 42,88 30,80 C18,72 12,58 15,43 C18,28 35,8 50,10 Z"
              fill={`hsla(${blobColors.blob1.h}, ${blobColors.blob1.s}%, ${blobColors.blob1.l}%, 0.5)`}
              style={{ transition: 'fill 0.3s ease' }}
            >
              <animate
                attributeName="d"
                values="M50,10 C65,12 75,20 80,35 C85,50 82,65 70,75 C58,85 42,88 30,80 C18,72 12,58 15,43 C18,28 35,8 50,10 Z;
                        M50,8 C68,15 78,25 82,40 C86,55 80,68 65,78 C50,88 35,85 25,72 C15,59 10,45 18,30 C26,15 32,1 50,8 Z;
                        M50,12 C62,10 72,22 78,38 C84,54 85,70 72,80 C59,90 40,92 28,78 C16,64 8,48 12,32 C16,16 38,14 50,12 Z;
                        M50,10 C65,12 75,20 80,35 C85,50 82,65 70,75 C58,85 42,88 30,80 C18,72 12,58 15,43 C18,28 35,8 50,10 Z"
                dur="6s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        </div>

        {/* Blob 2 - Large, slow, irregular liquid shape */}
        <div
          className="absolute"
          style={{
            transform: `translate(${blob2Pos.x}px, ${blob2Pos.y}px) translate(-50%, -50%)`,
            width: '160px',
            height: '160px'
          }}
        >
          <svg width="160" height="160" viewBox="0 0 160 160">
            <path
              d="M80,15 C105,18 125,30 135,55 C145,80 142,105 120,125 C98,145 72,150 50,135 C28,120 18,95 25,70 C32,45 55,12 80,15 Z"
              fill={`hsla(${blobColors.blob2.h}, ${blobColors.blob2.s}%, ${blobColors.blob2.l}%, 0.45)`}
              style={{ transition: 'fill 0.3s ease' }}
            >
              <animate
                attributeName="d"
                values="M80,15 C105,18 125,30 135,55 C145,80 142,105 120,125 C98,145 72,150 50,135 C28,120 18,95 25,70 C32,45 55,12 80,15 Z;
                        M80,20 C110,25 130,40 138,65 C146,90 135,110 110,130 C85,150 60,148 40,128 C20,108 15,80 28,55 C41,30 50,15 80,20 Z;
                        M80,12 C100,15 120,35 132,60 C144,85 148,110 125,132 C102,154 75,155 52,138 C29,121 12,95 20,65 C28,35 60,9 80,12 Z;
                        M80,15 C105,18 125,30 135,55 C145,80 142,105 120,125 C98,145 72,150 50,135 C28,120 18,95 25,70 C32,45 55,12 80,15 Z"
                dur="7s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        </div>

        {/* Blob 3 - Medium, irregular liquid shape */}
        <div
          className="absolute"
          style={{
            transform: `translate(${blob3Pos.x}px, ${blob3Pos.y}px) translate(-50%, -50%)`,
            width: '120px',
            height: '120px'
          }}
        >
          <svg width="120" height="120" viewBox="0 0 120 120">
            <path
              d="M60,12 C78,15 92,25 98,45 C104,65 100,85 82,98 C64,111 45,110 32,95 C19,80 14,60 22,42 C30,24 42,9 60,12 Z"
              fill={`hsla(${blobColors.blob3.h}, ${blobColors.blob3.s}%, ${blobColors.blob3.l}%, 0.48)`}
              style={{ transition: 'fill 0.3s ease' }}
            >
              <animate
                attributeName="d"
                values="M60,12 C78,15 92,25 98,45 C104,65 100,85 82,98 C64,111 45,110 32,95 C19,80 14,60 22,42 C30,24 42,9 60,12 Z;
                        M60,10 C82,18 95,32 100,52 C105,72 98,90 78,102 C58,114 38,108 26,90 C14,72 12,50 25,32 C38,14 38,2 60,10 Z;
                        M60,15 C75,12 88,28 96,48 C104,68 102,88 85,100 C68,112 48,112 35,98 C22,84 16,62 24,42 C32,22 45,18 60,15 Z;
                        M60,12 C78,15 92,25 98,45 C104,65 100,85 82,98 C64,111 45,110 32,95 C19,80 14,60 22,42 C30,24 42,9 60,12 Z"
                dur="6.5s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
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

          {/* CTA Button with melting effect */}
          <div className="animate-slide-up relative">
            <button
              onClick={() => {
                setIsButtonMelting(true)
                // 生成多个液滴，每个有不同的延迟
                const drops = Array.from({ length: 6 }, (_, i) => ({
                  id: i,
                  delay: i * 100
                }))
                setMeltingDrops(drops)

                // 1.5秒后显示底部液体
                setTimeout(() => {
                  setShowBottomLiquid(true)
                }, 1500)

                // 2秒后触发回调
                setTimeout(() => {
                  if (onStart) onStart()
                }, 2000)
              }}
              className={cn(
                "group relative px-12 py-4 bg-primary text-primary-foreground rounded-full font-medium text-lg shadow-lg hover:shadow-xl overflow-hidden",
                "transition-all duration-300",
                isButtonMelting ? "scale-95 opacity-0" : "hover:scale-[1.02] active:scale-[0.98]"
              )}
              style={{
                filter: isButtonMelting ? 'url(#goo)' : 'none'
              }}
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

            {/* Melting drops falling down */}
            {isButtonMelting && meltingDrops.map((drop) => (
              <div
                key={drop.id}
                className="absolute rounded-full"
                style={{
                  width: '25px',
                  height: '35px',
                  left: `${30 + drop.id * 10}%`,
                  top: '50%',
                  backgroundColor: `hsla(${220 + drop.id * 15}, 75%, 65%, 0.85)`,
                  filter: 'url(#goo)',
                  animation: `drop-fall 1.2s ease-in forwards`,
                  animationDelay: `${drop.delay}ms`,
                  borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%'
                }}
              />
            ))}
          </div>

          {/* Helpful hints */}
          <div className="animate-fade-in-delayed-2 pt-8">
            <p className="text-center text-sm text-muted-foreground font-light">
              <span className="inline-block transition-opacity duration-500">
                {hints[currentHint]}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom liquid wave animation */}
      {showBottomLiquid && (
        <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none overflow-hidden">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
            style={{ filter: 'url(#goo)' }}
          >
            <path
              d="M0,60 Q150,80 300,60 T600,60 T900,60 T1200,60 L1200,120 L0,120 Z"
              fill="hsla(240, 75%, 65%, 0.6)"
            >
              <animate
                attributeName="d"
                values="M0,60 Q150,80 300,60 T600,60 T900,60 T1200,60 L1200,120 L0,120 Z;
                        M0,60 Q150,40 300,60 T600,60 T900,60 T1200,60 L1200,120 L0,120 Z;
                        M0,60 Q150,80 300,60 T600,60 T900,60 T1200,60 L1200,120 L0,120 Z"
                dur="3s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        </div>
      )}

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

        /* Drop falling animation */
        @keyframes drop-fall {
          0% {
            transform: translateY(0) scaleY(1);
            opacity: 1;
          }
          50% {
            transform: translateY(30vh) scaleY(1.2);
            opacity: 0.9;
          }
          100% {
            transform: translateY(60vh) scaleY(0.8);
            opacity: 0;
          }
        }

        /* Melting particle animations */
        @keyframes melt-particle-0 {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-80px, 60px) scale(0.3);
            opacity: 0;
          }
        }

        @keyframes melt-particle-1 {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(80px, 50px) scale(0.4);
            opacity: 0;
          }
        }

        @keyframes melt-particle-2 {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-20px, 80px) scale(0.2);
            opacity: 0;
          }
        }

        @keyframes melt-particle-3 {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(50px, -60px) scale(0.35);
            opacity: 0;
          }
        }

        @keyframes melt-particle-4 {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-70px, -50px) scale(0.25);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

export default WelcomeMessageWithBlob
