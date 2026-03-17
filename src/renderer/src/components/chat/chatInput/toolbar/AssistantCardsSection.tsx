import { AddAssistantDrawer } from '@renderer/components/chat/chatInput/toolbar/AddAssistantDrawer'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useAssistantStore } from '@renderer/store/assistant'
import React, { useEffect, useMemo, useRef, useState } from 'react'

interface AssistantCardsSectionProps {
  panelOpen: boolean
}

const AssistantCardsSection: React.FC<AssistantCardsSectionProps> = ({ panelOpen }) => {
  const { getModelOptions, providersRevision } = useAppConfigStore()
  const { assistants, currentAssistant, setCurrentAssistant, loadAssistants } = useAssistantStore()
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartScrollLeftRef = useRef(0)
  const hasMovedRef = useRef(false)
  const pauseUntilRef = useRef(0)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  useEffect(() => {
    if (panelOpen && assistants.length === 0) {
      void loadAssistants()
    }
  }, [panelOpen, assistants.length, loadAssistants])

  const modelOptions = useMemo(() => getModelOptions(), [getModelOptions, providersRevision])

  const currentAssistants = assistants

  const markUserInteraction = () => {
    pauseUntilRef.current = Date.now() + 2500
  }

  const updateScrollButtons = () => {
    const container = scrollContainerRef.current
    if (!container) return

    const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0)
    setCanScrollPrev(container.scrollLeft > 2)
    setCanScrollNext(container.scrollLeft < maxScrollLeft - 2)
  }

  const goPrevAssistants = () => {
    const container = scrollContainerRef.current
    if (!container) return
    markUserInteraction()
    container.scrollBy({ left: -160, behavior: 'smooth' })
  }

  const goNextAssistants = () => {
    const container = scrollContainerRef.current
    if (!container) return
    markUserInteraction()
    container.scrollBy({ left: 160, behavior: 'smooth' })
  }

  const onDragStart = (clientX: number) => {
    const container = scrollContainerRef.current
    if (!container) return
    isDraggingRef.current = true
    hasMovedRef.current = false
    dragStartXRef.current = clientX
    dragStartScrollLeftRef.current = container.scrollLeft
    markUserInteraction()
  }

  const onDragMove = (clientX: number) => {
    if (!isDraggingRef.current) return
    const container = scrollContainerRef.current
    if (!container) return
    const deltaX = clientX - dragStartXRef.current
    if (Math.abs(deltaX) > 3) {
      hasMovedRef.current = true
    }
    container.scrollLeft = dragStartScrollLeftRef.current - deltaX
  }

  const onDragEnd = () => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    markUserInteraction()
  }

  useEffect(() => {
    updateScrollButtons()
  }, [assistants.length])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const onScroll = () => updateScrollButtons()
    const onResize = () => updateScrollButtons()

    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    let rafId = 0

    const loop = () => {
      const container = scrollContainerRef.current
      if (container && !isDraggingRef.current && Date.now() >= pauseUntilRef.current) {
        const maxScrollLeft = container.scrollWidth - container.clientWidth
        if (maxScrollLeft > 1) {
          container.scrollLeft += 0.35
          if (container.scrollLeft >= maxScrollLeft) {
            container.scrollLeft = 0
          }
        }
      }
      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="space-y-3 shrink-0">
      <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800/60">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Assistant
        </span>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex flex-nowrap gap-2 overflow-x-auto pb-1 select-none cursor-grab active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        onMouseDown={e => onDragStart(e.clientX)}
        onMouseMove={e => {
          onDragMove(e.clientX)
          if (isDraggingRef.current) {
            e.preventDefault()
          }
        }}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={e => onDragStart(e.touches[0]?.clientX ?? 0)}
        onTouchMove={e => onDragMove(e.touches[0]?.clientX ?? 0)}
        onTouchEnd={onDragEnd}
        onWheel={markUserInteraction}
      >
        {currentAssistants.map(assistant => {
          const isActive = currentAssistant?.id === assistant.id
          return (
            <button
              key={assistant.id}
              onClick={e => {
                if (hasMovedRef.current) {
                  e.preventDefault()
                  return
                }
                setCurrentAssistant(isActive ? null : assistant)
              }}
              className={cn(
                "flex-none w-fit rounded-full border px-3 py-1.5 text-center transition-all duration-200",
                "bg-white/70 dark:bg-slate-900/40",
                "hover:border-sky-300/80 dark:hover:border-sky-600/60",
                "hover:bg-sky-50/85 dark:hover:bg-sky-900/20",
                "hover:shadow-[0_8px_20px_-14px_rgba(14,165,233,0.5)]",
                "active:scale-[0.98] active:translate-y-0",
                isActive
                  ? "border-sky-300 dark:border-sky-700 bg-sky-50/85 dark:bg-sky-900/25 shadow-[0_8px_20px_-14px_rgba(14,165,233,0.45)]"
                  : "border-slate-200/70 dark:border-slate-800/80"
              )}
            >
              <div className={cn(
                "text-[11px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap",
                isActive ? "text-sky-700/90" : ""
              )}>
                {assistant.name}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AddAssistantDrawer isExpanded={true} variant="compact" modelOptions={modelOptions} />
          {currentAssistant && (
            <AddAssistantDrawer
              isExpanded={true}
              variant="compact"
              mode="edit"
              assistantToEdit={currentAssistant}
              modelOptions={modelOptions}
            />
          )}
        </div>
        <div className="flex items-center gap-1 select-none">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-1.5 rounded-md border border-transparent",
              "text-slate-500 dark:text-slate-400",
              "hover:text-slate-700 dark:hover:text-slate-200",
              "hover:bg-slate-100/80 dark:hover:bg-slate-800/70",
              "hover:border-slate-200/80 dark:hover:border-slate-700/80",
              "hover:shadow-xs hover:scale-105 active:scale-95",
              "transition-all duration-200 disabled:opacity-30"
            )}
            onClick={goPrevAssistants}
            disabled={!canScrollPrev}
          >
            {'<'}
          </Button>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums min-w-[40px] text-center">
            {`${assistants.length}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-1.5 rounded-md border border-transparent",
              "text-slate-500 dark:text-slate-400",
              "hover:text-slate-700 dark:hover:text-slate-200",
              "hover:bg-slate-100/80 dark:hover:bg-slate-800/70",
              "hover:border-slate-200/80 dark:hover:border-slate-700/80",
              "hover:shadow-xs hover:scale-105 active:scale-95",
              "transition-all duration-200 disabled:opacity-30"
            )}
            onClick={goNextAssistants}
            disabled={!canScrollNext}
          >
            {'>'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AssistantCardsSection
