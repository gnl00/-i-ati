import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import type {
  SupportRenderUnit,
  SupportSegmentRenderItem
} from '@renderer/components/chat/chatMessage/assistant-message/model/assistantMessageMapper'
import { buildSupportRenderUnits } from '@renderer/components/chat/chatMessage/assistant-message/model/assistantSupportGrouping'
import { AssistantSupportSegmentContent } from '@renderer/components/chat/chatMessage/assistant-message/renderers/AssistantSupportSegmentContent'
import { SupportSegmentGroup } from '@renderer/components/chat/chatMessage/assistant-message/renderers/SupportSegmentGroup'
import { cn } from '@renderer/lib/utils'

interface PlaybackStep {
  label: string
  status: string
  items: SupportSegmentRenderItem[]
}

const baseTimestamp = Date.now() - 12_000

const createToolSegment = (args: {
  id: string
  name: string
  order: number
  status: 'pending' | 'running' | 'completed'
  reason: string
  result?: string
}): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: `streaming-merge:${args.id}`,
  name: args.name,
  timestamp: baseTimestamp + args.order * 900,
  executionStartedAt: baseTimestamp + args.order * 900,
  cost: args.status === 'completed' ? 620 + args.order * 180 : undefined,
  isError: false,
  toolCallId: `call-${args.id}`,
  toolCallIndex: args.order,
  content: {
    toolName: args.name,
    status: args.status,
    args: {
      step: args.order + 1,
      [TOOL_CALL_REASON_PARAMETER_NAME]: args.reason
    },
    ...(args.result
      ? {
          result: {
            ok: true,
            summary: args.result
          }
        }
      : {})
  }
})

const createReasoningSegment = (args: {
  id: string
  order: number
  content: string
  done?: boolean
}): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: `streaming-merge:${args.id}`,
  content: args.content,
  timestamp: baseTimestamp + args.order * 900,
  ...(args.done ? { endedAt: baseTimestamp + args.order * 900 + 720 } : {})
})

const supportItem = (
  segment: ToolCallSegment | ReasoningSegment,
  order: number,
  isStreamingTail = false
): SupportSegmentRenderItem => ({
  key: `preview-${segment.segmentId}-${order}`,
  layer: 'preview',
  sourceIndex: order,
  order,
  segment,
  isStreamingTail
})

const buildPlaybackSteps = (): PlaybackStep[] => {
  const readRunning = supportItem(createToolSegment({
    id: 'tool-read',
    name: 'read_file',
    order: 0,
    status: 'running',
    reason: 'Read the grouping model before updating renderer behavior.'
  }), 0)
  const readDone = supportItem(createToolSegment({
    id: 'tool-read',
    name: 'read_file',
    order: 0,
    status: 'completed',
    reason: 'Read the grouping model before updating renderer behavior.',
    result: 'Loaded assistantSupportGrouping.ts.'
  }), 0)
  const searchRunning = supportItem(createToolSegment({
    id: 'tool-search',
    name: 'rg',
    order: 1,
    status: 'running',
    reason: 'Find the renderer rows that remount during streaming append.'
  }), 1)
  const searchDone = supportItem(createToolSegment({
    id: 'tool-search',
    name: 'rg',
    order: 1,
    status: 'completed',
    reason: 'Find the renderer rows that remount during streaming append.',
    result: 'Found phase key and group identity.'
  }), 1)
  const thoughtStreaming = supportItem(createReasoningSegment({
    id: 'thought-anchor',
    order: 2,
    content: 'The first support item can anchor the group while new tool and thought rows append into the same shell.'
  }), 2, true)
  const thoughtDone = supportItem(createReasoningSegment({
    id: 'thought-anchor',
    order: 2,
    content: 'The first support item can anchor the group while new tool and thought rows append into the same shell.',
    done: true
  }), 2)
  const patchRunning = supportItem(createToolSegment({
    id: 'tool-patch',
    name: 'apply_patch',
    order: 3,
    status: 'running',
    reason: 'Apply the stable shell and append motion changes.'
  }), 3)
  const patchDone = supportItem(createToolSegment({
    id: 'tool-patch',
    name: 'apply_patch',
    order: 3,
    status: 'completed',
    reason: 'Apply the stable shell and append motion changes.',
    result: 'Renderer updated.'
  }), 3)
  const verifyRunning = supportItem(createToolSegment({
    id: 'tool-verify',
    name: 'vitest',
    order: 4,
    status: 'running',
    reason: 'Verify append keeps user expansion choice.'
  }), 4)
  const verifyDone = supportItem(createToolSegment({
    id: 'tool-verify',
    name: 'vitest',
    order: 4,
    status: 'completed',
    reason: 'Verify append keeps user expansion choice.',
    result: 'Focused test passed.'
  }), 4)

  return [
    {
      label: '01',
      status: 'Single running tool inside group shell',
      items: [readRunning]
    },
    {
      label: '02',
      status: 'Second tool appends into the shell',
      items: [readRunning, searchRunning]
    },
    {
      label: '03',
      status: 'First completes while second keeps running',
      items: [readDone, searchRunning]
    },
    {
      label: '04',
      status: 'Thought row appends as streaming tail',
      items: [readDone, searchDone, thoughtStreaming]
    },
    {
      label: '05',
      status: 'More tool rows keep the support group stable',
      items: [readDone, searchDone, thoughtDone, patchRunning]
    },
    {
      label: '06',
      status: 'Verification tool appends at the tail',
      items: [readDone, searchDone, thoughtDone, patchDone, verifyRunning]
    },
    {
      label: '07',
      status: 'Settled group can collapse and expand without changing shell identity',
      items: [readDone, searchDone, thoughtDone, patchDone, verifyDone]
    }
  ]
}

const playbackSteps = buildPlaybackSteps()

const buildAccordionStressSteps = (): PlaybackStep[] => {
  const inspectDone = supportItem(createToolSegment({
    id: 'stress-inspect',
    name: 'read_file',
    order: 0,
    status: 'completed',
    reason: 'Inspect the current support group shell.',
    result: 'Group shell is mounted.'
  }), 0)
  const thoughtOneDone = supportItem(createReasoningSegment({
    id: 'stress-thought-one',
    order: 1,
    content: 'The accordion should keep one shell while rows settle.',
    done: true
  }), 1)
  const patchRunning = supportItem(createToolSegment({
    id: 'stress-patch',
    name: 'apply_patch',
    order: 2,
    status: 'running',
    reason: 'Apply the motion shell change.'
  }), 2)
  const patchDone = supportItem(createToolSegment({
    id: 'stress-patch',
    name: 'apply_patch',
    order: 2,
    status: 'completed',
    reason: 'Apply the motion shell change.',
    result: 'Stable shell applied.'
  }), 2)
  const thoughtTwoDone = supportItem(createReasoningSegment({
    id: 'stress-thought-two',
    order: 3,
    content: 'Once all support items complete, the compact summary should replace the middle rows.',
    done: true
  }), 3)
  const verifyPending = supportItem(createToolSegment({
    id: 'stress-verify',
    name: 'vitest',
    order: 4,
    status: 'pending',
    reason: 'Verify the completed group can collapse.'
  }), 4)
  const verifyDone = supportItem(createToolSegment({
    id: 'stress-verify',
    name: 'vitest',
    order: 4,
    status: 'completed',
    reason: 'Verify the completed group can collapse.',
    result: 'SupportSegmentGroup regression passed.'
  }), 4)

  return [
    {
      label: 'A1',
      status: 'Running and pending rows force the accordion open.',
      items: [inspectDone, thoughtOneDone, patchRunning, thoughtTwoDone, verifyPending]
    },
    {
      label: 'A2',
      status: 'All rows complete, so the same shell settles into the compact collapsed state.',
      items: [inspectDone, thoughtOneDone, patchDone, thoughtTwoDone, verifyDone]
    }
  ]
}

const accordionStressSteps = buildAccordionStressSteps()

function SupportUnitPreview({
  units,
  forceReducedMotion
}: {
  units: SupportRenderUnit[]
  forceReducedMotion?: boolean
}) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      {units.map(unit => (
        <div key={unit.key} style={{ order: unit.order }} className="w-full">
          {unit.type === 'supportGroup' ? (
            <SupportSegmentGroup
              items={unit.items}
              forceReducedMotion={forceReducedMotion}
            />
          ) : (
            <AssistantSupportSegmentContent item={unit.item} />
          )}
        </div>
      ))}
    </div>
  )
}

function PlaybackPanel({
  title,
  caption,
  step,
  forceReducedMotion = false
}: {
  title: string
  caption: string
  step: PlaybackStep
  forceReducedMotion?: boolean
}) {
  const units = useMemo(() => (
    buildSupportRenderUnits(step.items, { groupSingletons: true })
  ), [step.items])

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-slate-200/72 bg-white/72 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.48)] backdrop-blur-xl dark:border-white/9 dark:bg-slate-950/48">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/68 px-4 py-3 dark:border-white/8">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{caption}</p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-100/84 px-2 py-1 text-[10px] font-semibold tabular-nums text-slate-500 dark:bg-white/7 dark:text-slate-400">
          {step.label}
        </span>
      </div>

      <div className="h-[420px] overflow-y-auto bg-chat-light px-4 py-5 dark:bg-chat-dark">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="w-fit max-w-full rounded-lg border border-slate-200/70 bg-white/78 px-3 py-2 text-xs leading-5 text-slate-600 shadow-xs dark:border-white/8 dark:bg-slate-950/58 dark:text-slate-300">
            {step.status}
          </div>
          <SupportUnitPreview
            units={units}
            forceReducedMotion={forceReducedMotion}
          />
          <div className="max-w-2xl rounded-lg border border-dashed border-slate-200/80 bg-white/54 px-3 py-2 text-xs leading-5 text-slate-500 dark:border-white/9 dark:bg-white/4 dark:text-slate-400">
            Assistant text continues below the support group while new rows stream into the same stable shell.
          </div>
        </div>
      </div>
    </section>
  )
}

export default function SupportSegmentStreamingMergeTestPage() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const activeStep = playbackSteps[activeIndex]
  const accordionStressStep = accordionStressSteps[activeIndex % accordionStressSteps.length]

  useEffect(() => {
    if (!isPlaying) {
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex(index => (index + 1) % playbackSteps.length)
    }, 1300)

    return () => window.clearInterval(intervalId)
  }, [isPlaying])

  const goNext = () => {
    setActiveIndex(index => (index + 1) % playbackSteps.length)
    setIsPlaying(false)
  }

  const reset = () => {
    setActiveIndex(0)
    setIsPlaying(false)
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-5 py-6 text-slate-900 dark:bg-[#0d1014] dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
              Support Segment Streaming Merge
            </p>
            <h1 className="text-xl font-semibold text-slate-950 dark:text-white">
              Stable support group append playground
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Step through tool and thought appends while watching the group shell, phase rows, and reduced-motion fallback.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/82 p-1 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.45)] dark:border-white/9 dark:bg-white/7">
            <button
              type="button"
              onClick={() => setIsPlaying(value => !value)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
              title="Next step"
            >
              <StepForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
              title="Reset"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex flex-wrap gap-1.5">
          {playbackSteps.map((step, index) => (
            <button
              key={step.label}
              type="button"
              onClick={() => {
                setActiveIndex(index)
                setIsPlaying(false)
              }}
              className={cn(
                'rounded-md px-2.5 py-1 text-[10px] font-semibold tabular-nums transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02]',
                index === activeIndex
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                  : 'border border-slate-200/78 bg-white/70 text-slate-500 hover:bg-white hover:text-slate-900 dark:border-white/8 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100'
              )}
            >
              {step.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <PlaybackPanel
            title="Normal motion"
            caption="Opacity, 4px y, and small scale on appended rows."
            step={activeStep}
          />
          <PlaybackPanel
            title="Reduced motion"
            caption="The same renderer with motion override enabled."
            step={activeStep}
            forceReducedMotion
          />
        </div>

        <section className="flex flex-col gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Accordion stress
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              The same five-row group alternates between forced expanded running state and completed collapsed state.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <PlaybackPanel
              title="Normal motion stress"
              caption="Shell size motion carries the collapse."
              step={accordionStressStep}
            />
            <PlaybackPanel
              title="Reduced motion stress"
              caption="Static state switch with the same content."
              step={accordionStressStep}
              forceReducedMotion
            />
          </div>
        </section>
      </div>
    </main>
  )
}
