import { useEffect, useMemo, useState } from 'react'
import { Gauge, Pause, Play, RotateCcw } from 'lucide-react'
import { ModelBadge } from '@renderer/features/chat/message/assistant-message/model-badge/ModelBadge'
import { ToolCallResult } from '@renderer/features/chat/message/assistant-message/toolcall/ToolCallResult'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

interface ReasonPlaybackItem {
  id: string
  toolName: string
  reason: string
  order: number
  isTerminal: boolean
}

const reasonSequence: ReasonPlaybackItem[] = [
  {
    id: 'history-search',
    toolName: 'search',
    reason: 'Find the existing model badge and assistant header wiring before changing the render contract.',
    order: 0,
    isTerminal: true
  },
  {
    id: 'history-read',
    toolName: 'read_file',
    reason: 'Read the badge implementation so the reason stays attached to the matching tool row.',
    order: 1,
    isTerminal: true
  },
  {
    id: 'history-patch',
    toolName: 'apply_patch',
    reason: 'Add row-level reason display that keeps each tool call intention visible during fast updates.',
    order: 2,
    isTerminal: true
  },
  {
    id: 'history-test',
    toolName: 'typecheck',
    reason: 'Verify the renderer type surface after moving reason display into each tool trigger.',
    order: 3,
    isTerminal: false
  }
]

function useReasonPlayback() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)

  useEffect(() => {
    if (!isPlaying) {
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex(index => (index + 1) % reasonSequence.length)
    }, 950)

    return () => window.clearInterval(intervalId)
  }, [isPlaying])

  const visibleReasons = useMemo(() => (
    reasonSequence.slice(0, activeIndex + 1).map((item, index, items) => ({
      ...item,
      isTerminal: index < items.length - 1
    }))
  ), [activeIndex])

  return {
    activeIndex,
    isPlaying,
    visibleReasons,
    setActiveIndex,
    setIsPlaying
  }
}

function buildReasonToolCall(item: ReasonPlaybackItem, index: number): ToolCallSegment {
  return {
    type: 'toolCall',
    segmentId: `reason-history-${item.id}`,
    name: item.toolName,
    timestamp: Date.now() - (index + 1) * 720,
    executionStartedAt: Date.now() - (index + 1) * 720,
    cost: item.isTerminal ? 680 + index * 160 : undefined,
    toolCallId: `reason-history-call-${item.id}`,
    toolCallIndex: index,
    isError: false,
    content: {
      toolName: item.toolName,
      status: item.isTerminal ? 'completed' : 'running',
      args: {
        step: item.order + 1,
        [TOOL_CALL_REASON_PARAMETER_NAME]: item.reason
      },
      ...(item.isTerminal
        ? {
            result: {
              ok: true,
              summary: `${item.toolName} completed`
            }
          }
        : {})
    }
  }
}

function ViewportProbe({
  title,
  width,
  reasons
}: {
  title: string
  width: string
  reasons: ReasonPlaybackItem[]
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-slate-950/52">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Fast updates keep previous reasons visible and scroll to the newest item.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-white/7 dark:text-slate-400">
          <Gauge className="h-3 w-3" />
          {width}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-slate-50/82 p-4 dark:border-white/8 dark:bg-black/20">
        <div style={{ width }} className="max-w-full">
          <div className="flex flex-col items-start gap-2">
            <ModelBadge
              model="MiniMax-M2.5"
              provider="minimax"
              animate
              emotionLabel="focused"
              emotionEmoji="◐"
              emotionIntensity={2}
            />

            <div className="flex w-full flex-col gap-1.5">
              {reasons.map((item, index) => (
                <ToolCallResult
                  key={`${item.id}:${item.isTerminal ? 'terminal' : 'active'}`}
                  toolCall={buildReasonToolCall(item, index)}
                  index={index}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">
            Assistant message content starts here. Tool reasons now stay attached to each tool trigger in the transcript body.
          </div>
        </div>
      </div>
    </section>
  )
}

export default function ToolCallReasonHistoryTestPage() {
  const {
    activeIndex,
    isPlaying,
    visibleReasons,
    setActiveIndex,
    setIsPlaying
  } = useReasonPlayback()

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900 dark:bg-[#0d1014] dark:text-slate-100">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Tool Call Reason History
            </p>
            <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
              Keep rapid tool-call reasons readable.
            </h1>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
              This page stress-tests row-level tool reasons with a fast playback loop plus narrow and wide viewports.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-2xl bg-white/80 p-1 shadow-[0_16px_48px_-34px_rgba(15,23,42,0.45)] dark:bg-white/7">
            <button
              type="button"
              onClick={() => setIsPlaying(value => !value)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveIndex(0)
                setIsPlaying(false)
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
              title="Reset"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex flex-wrap gap-1.5">
          {reasonSequence.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveIndex(index)
                setIsPlaying(false)
              }}
              className={[
                'rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
                index === activeIndex
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : index < activeIndex
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-300/12 dark:text-emerald-300'
                    : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-white/6 dark:text-slate-400 dark:hover:bg-white/10'
              ].join(' ')}
            >
              {index + 1}. {item.toolName}
            </button>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <ViewportProbe title="Wide Badge Lane" width="760px" reasons={visibleReasons} />
          <ViewportProbe title="Narrow Badge Lane" width="360px" reasons={visibleReasons} />
        </div>
      </main>
    </div>
  )
}
