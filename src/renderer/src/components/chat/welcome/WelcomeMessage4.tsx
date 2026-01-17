import { cn } from '@renderer/lib/utils'
import React, { useState, useEffect } from 'react'

interface WelcomeMessage4Props {
  className?: string
  onStart?: () => void
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  opacity: number
}

const PARTICLE_COLORS = [
  '#3B82F6', // blue-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#10B981', // emerald-500
]

const WelcomeMessage4: React.FC<WelcomeMessage4Props> = ({ className, onStart }) => {
  const [isClicked, setIsClicked] = useState(false)
  const [particles, setParticles] = useState<Particle[]>([])
  const [titleText, setTitleText] = useState('')
  const fullTitle = 'How can I help?'

  // Typewriter effect for title
  useEffect(() => {
    let i = 0
    const typeInterval = setInterval(() => {
      if (i <= fullTitle.length) {
        setTitleText(fullTitle.slice(0, i))
        i++
      } else {
        clearInterval(typeInterval)
      }
    }, 100)

    return () => clearInterval(typeInterval)
  }, [])

  // Generate particles on click
  const createParticles = (buttonElement: HTMLElement) => {
    const rect = buttonElement.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const newParticles: Particle[] = Array.from({ length: 20 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 20
      const velocity = 3 + Math.random() * 2
      const vx = Math.cos(angle) * velocity
      const vy = Math.sin(angle) * velocity

      return {
        id: i,
        x: centerX,
        y: centerY,
        vx,
        vy,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        size: 4 + Math.random() * 4,
        opacity: 1,
      }
    })

    setParticles(newParticles)
    animateParticles(newParticles)
  }

  const animateParticles = (initialParticles: Particle[]) => {
    const animate = () => {
      setParticles(prevParticles => {
        const updatedParticles = prevParticles.map(particle => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          opacity: particle.opacity - 0.02,
          size: particle.size * 0.98,
        })).filter(p => p.opacity > 0)

        if (updatedParticles.length > 0) {
          requestAnimationFrame(animate)
        } else {
          setParticles([])
        }

        return updatedParticles
      })
    }

    requestAnimationFrame(animate)
  }

  const handleStartClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsClicked(true)
    createParticles(e.currentTarget)

    setTimeout(() => {
      if (onStart) {
        onStart()
      }
    }, 500)
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center h-[70vh] w-full px-8 py-16 relative overflow-hidden",
        className
      )}
    >
      {/* Animated Background Decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating geometric shapes */}
        <div className="absolute top-1/4 left-1/4 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 right-1/3 w-56 h-56 bg-violet-500/5 rounded-full blur-3xl animate-float-slower" />
        <div className="absolute top-1/2 right-1/4 w-40 h-40 bg-cyan-500/3 rounded-full blur-3xl animate-float-medium" />

        {/* Gradient orbs */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-10 left-10 w-24 h-24 bg-gradient-to-br from-blue-400/10 to-transparent rounded-full animate-pulse-soft" />
          <div className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-violet-400/10 to-transparent rounded-full animate-pulse-soft-delayed" />
        </div>

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]">
          <div className="w-full h-full" style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }} />
        </div>
      </div>

      {/* Particle Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map(particle => (
          <div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              left: particle.x,
              top: particle.y,
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              opacity: particle.opacity,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className={cn(
        "max-w-2xl w-full flex flex-col items-center justify-center space-y-20 relative z-10",
        "transition-all duration-500 ease-out",
        isClicked && "opacity-0 -translate-y-4 pointer-events-none"
      )}>
          {/* Title - refined typography with typewriter effect */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-light tracking-wide text-slate-800 dark:text-slate-100 relative">
              <span className="inline-block animate-title-reveal">
                {titleText}
                <span className="animate-caret-blink">|</span>
              </span>
            </h1>
          </div>

          {/* Floating + Breathing Button - refined version */}
          <div className="relative group animate-float">
            {/* Ambient glow layer */}
            <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl opacity-60 animate-pulse-soft" />

            <button
              onClick={handleStartClick}
              disabled={isClicked}
              className={cn(
                "relative px-10 py-4 rounded-full font-medium text-base",
                "transition-all duration-500 ease-out",
                "hover:scale-105 active:scale-95",
                "hover:shadow-xl hover:shadow-blue-500/40",
                "hover:border hover:border-blue-400/50",
                "animate-breathing-shadow backdrop-blur-sm",
                "bg-slate-900 dark:bg-slate-50 text-slate-50 dark:text-slate-900",
                "border border-transparent",
                "cursor-pointer",
                isClicked && "animate-button-exit opacity-0 scale-75 pointer-events-none"
              )}
            >
              <span className="relative flex items-center gap-3 z-10">
                <svg
                  className="w-5 h-5 text-slate-400 dark:text-slate-500 transition-all duration-300 group-hover:scale-110 group-hover:text-blue-500 dark:group-hover:text-blue-400"
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
                <span className="relative">
                  Start Conversation
                </span>
              </span>
            </button>

            {/* Ripple effect */}
            {!isClicked && (
              <div className="absolute inset-0 rounded-full">
                <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ripple" />
              </div>
            )}
          </div>

          {/* Subtle hint - refined spacing */}
          <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 select-none font-light animate-hint-appear">
            <span className="relative">
              Type your message below
              <span className="absolute -bottom-1 left-0 w-full h-px bg-gradient-to-r from-transparent via-slate-400/50 to-transparent" />
            </span>
          </div>
      </div>

      <style>{`
        /* Original animations */
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes breathing-shadow {
          0%, 100% {
            box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.08),
                        0 2px 6px -1px rgba(15, 23, 42, 0.04),
                        0 0 0 1px rgba(59, 130, 246, 0);
          }
          50% {
            box-shadow: 0 12px 24px -4px rgba(15, 23, 42, 0.12),
                        0 6px 12px -2px rgba(15, 23, 42, 0.06),
                        0 0 0 1px rgba(59, 130, 246, 0.1);
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }

        /* New enhanced animations */
        @keyframes float-slow {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg);
          }
          33% {
            transform: translate(30px, -30px) rotate(120deg);
          }
          66% {
            transform: translate(-20px, 20px) rotate(240deg);
          }
        }

        @keyframes float-slower {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg);
          }
          50% {
            transform: translate(-40px, 40px) rotate(180deg);
          }
        }

        @keyframes float-medium {
          0%, 100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(20px, -20px);
          }
        }

        @keyframes pulse-soft {
          0%, 100% {
            opacity: 0.1;
            transform: scale(1);
          }
          50% {
            opacity: 0.2;
            transform: scale(1.1);
          }
        }

        @keyframes pulse-soft-delayed {
          0%, 100% {
            opacity: 0.08;
            transform: scale(1);
          }
          50% {
            opacity: 0.15;
            transform: scale(1.05);
          }
        }

        @keyframes title-reveal {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes caret-blink {
          0%, 50% {
            opacity: 1;
          }
          51%, 100% {
            opacity: 0;
          }
        }

        @keyframes button-appear {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          50% {
            transform: scale(1.05) translateY(-5px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes button-exit {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
          100% {
            opacity: 0;
            transform: scale(0.75);
          }
        }

        @keyframes ripple {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        @keyframes hint-appear {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Apply animations */
        .animate-float {
          animation: float 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .animate-breathing-shadow {
          animation: breathing-shadow 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .animate-pulse-glow {
          animation: pulse-glow 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .animate-float-slow {
          animation: float-slow 20s ease-in-out infinite;
        }

        .animate-float-slower {
          animation: float-slower 25s ease-in-out infinite;
        }

        .animate-float-medium {
          animation: float-medium 15s ease-in-out infinite;
        }

        .animate-pulse-soft {
          animation: pulse-soft 4s ease-in-out infinite;
        }

        .animate-pulse-soft-delayed {
          animation: pulse-soft-delayed 4s ease-in-out infinite;
          animation-delay: 2s;
        }

        .animate-title-reveal {
          animation: title-reveal 0.5s ease-out;
        }

        .animate-caret-blink {
          animation: caret-blink 1s infinite;
        }

        .animate-button-appear {
          animation: button-appear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
        }

        .animate-button-exit {
          animation: button-exit 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .animate-ripple {
          animation: ripple 2s ease-out infinite;
        }

        .animate-hint-appear {
          animation: hint-appear 0.5s ease-out 0.6s both;
        }
      `}</style>
    </div>
  )
}

export default WelcomeMessage4
