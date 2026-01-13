import { cn } from '@renderer/lib/utils'
import { useTransition, animated } from '@react-spring/web'
import React from 'react'
import { createPortal } from 'react-dom'

interface Command {
  cmd: string
  label: string
  description: string
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  query: string
  commands: Command[]
  selectedIndex: number
  position: { top: number; left: number; width: number }
  onCommandClick: (command: Command) => void
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  query,
  commands,
  selectedIndex,
  position,
  onCommandClick
}) => {
  // Filter commands based on query
  const filteredCommands = commands.filter(cmd =>
    cmd.cmd.toLowerCase().includes(query.toLowerCase()) ||
    cmd.label.toLowerCase().includes(query.toLowerCase())
  )

  // Animation with react-spring - scale and opacity separately
  const transition = useTransition(isOpen, {
    from: { scale: 0.95, opacity: 0 },
    enter: { scale: 1, opacity: 1 },
    leave: { scale: 0.95, opacity: 0 },
    config: { tension: 300, friction: 25 }
  })

  return (
    <>
      {transition((style, item) =>
        item ? createPortal(
          (() => {
            if (filteredCommands.length === 0) return null

            return (
              <animated.div
                className="fixed z-[9999]"
                style={{
                  top: `${position.top - 10}px`,
                  left: `${position.left}px`,
                  width: `${position.width}px`,
                  transform: 'translateY(-100%)',
                  opacity: style.opacity
                }}
              >
                <animated.div
                  style={{
                    transformOrigin: 'bottom center',
                    transform: style.scale.to(s => `scale(${s})`)
                  }}
                >
                  <div className="bg-white/90 dark:bg-gray-900/95 backdrop-blur-xl rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
                  <div className="p-1">
                    {filteredCommands.map((cmd, index) => (
                      <div
                        key={cmd.cmd}
                        className={cn(
                          "px-3 py-2 rounded-lg cursor-pointer transition-colors",
                          index === selectedIndex
                            ? "bg-blue-gray-100 dark:bg-blue-900/20"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        )}
                        onClick={() => onCommandClick(cmd)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className={cn(
                              "text-sm font-medium transition-colors",
                              index === selectedIndex
                                ? "text-blue-500 dark:text-blue-300"
                                : "text-gray-900 dark:text-gray-100"
                            )}>
                              {cmd.label}
                            </div>
                            <div className={cn(
                              "text-xs mt-0.5 transition-colors",
                              index === selectedIndex
                                ? "text-blue-500 dark:text-blue-400"
                                : "text-gray-500 dark:text-gray-400"
                            )}>
                              {cmd.description}
                            </div>
                          </div>
                          <div className={cn(
                            "text-xs font-mono ml-2 transition-colors",
                            index === selectedIndex
                              ? "text-blue-500 dark:text-blue-400"
                              : "text-gray-400 dark:text-gray-500"
                          )}>
                            {cmd.cmd}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </animated.div>
            </animated.div>
          )
          })(),
          document.body
        ) : null
      )}
    </>
  )
}

export default CommandPalette
