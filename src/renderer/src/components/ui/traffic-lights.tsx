import { invokeWindowClose, invokeWindowMinimize, invokeWindowMaximize } from '@renderer/invoker/ipcInvoker'
import React, { useState } from 'react'

interface TrafficLightsProps {
  className?: string
}

const TrafficLights: React.FC<TrafficLightsProps> = ({ className = '' }) => {
  const [isHovered, setIsHovered] = useState(false)

  const handleClose = () => {
    invokeWindowClose()
  }

  const handleMinimize = () => {
    invokeWindowMinimize()
  }

  const handleMaximize = () => {
    invokeWindowMaximize()
  }

  return (
    <div
      className={`flex items-center space-x-2 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Close Button - Red */}
      <button
        onClick={handleClose}
        className="app-undragable w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors flex items-center justify-center group"
        aria-label="Close"
      >
        {isHovered && (
          <svg
            width="6"
            height="6"
            viewBox="0 0 6 6"
            fill="none"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <path
              d="M0.5 0.5L5.5 5.5M5.5 0.5L0.5 5.5"
              stroke="#4d0000"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      {/* Minimize Button - Yellow */}
      <button
        onClick={handleMinimize}
        className="app-undragable w-3 h-3 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 transition-colors flex items-center justify-center group"
        aria-label="Minimize"
      >
        {isHovered && (
          <svg
            width="6"
            height="1"
            viewBox="0 0 6 1"
            fill="none"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <path d="M0.5 0.5H5.5" stroke="#995700" strokeWidth="1" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Maximize/Restore Button - Green */}
      <button
        onClick={handleMaximize}
        className="app-undragable w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 transition-colors flex items-center justify-center group"
        aria-label="Maximize"
      >
        {isHovered && (
          <svg
            width="6"
            height="6"
            viewBox="0 0 6 6"
            fill="none"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <path
              d="M1 3L2.5 4.5L5 1.5"
              stroke="#006500"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  )
}

export default TrafficLights
