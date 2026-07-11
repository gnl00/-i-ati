import { BrainCircuit, Gauge, MessageSquareText, Pause, Play, RotateCcw } from 'lucide-react'
import {
  AssistantMessageLayout,
  type AssistantMessageLayoutProps
} from '@renderer/features/chat/message/assistant-message/AssistantMessageLayout'
import { AssistantMessage } from '@renderer/features/chat/message/assistant-message'
import type {
  SupportSegmentRenderItem,
  TextSegmentRenderItem
} from '@renderer/features/chat/message/assistant-message/model/assistantMessageMapper'
import { buildSupportRenderUnits } from '@renderer/features/chat/message/assistant-message/model/assistantSupportGrouping'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

const now = Date.now()
const noop = () => {}

type ToolCallMockStatus = 'completed' | 'running' | 'error'

interface ToolCallMockOptions {
  id: string
  name: string
  order: number
  sourceIndex: number
  reason: string
  args: Record<string, unknown>
  status?: ToolCallMockStatus
  cost?: number
  result?: unknown
  argsAsJsonString?: boolean
  isStreamingTail?: boolean
}

interface AssistantMockCase {
  id: string
  title: string
  note: string
  viewport: 'wide' | 'narrow'
  model: AssistantMessageLayoutProps
}

interface SequentialToolSpec {
  id: string
  name: string
  reason: string
  args: Record<string, unknown>
  cost: number
  result: unknown
}

function buildContainerToolCallSegment(options: {
  id: string
  name: string
  reason: string
  status: 'pending' | 'running' | 'completed'
  index: number
  args: Record<string, unknown>
  result?: unknown
}): ToolCallSegment {
  const status = options.status === 'completed' ? 'completed' : options.status

  return {
    type: 'toolCall',
    segmentId: `container-tool-${options.id}`,
    name: options.name,
    timestamp: now + options.index * 10,
    toolCallId: `container-call-${options.id}`,
    toolCallIndex: options.index,
    cost: status === 'completed' ? 980 + options.index * 120 : undefined,
    content: {
      toolName: options.name,
      args: JSON.stringify({
        ...options.args,
        [TOOL_CALL_REASON_PARAMETER_NAME]: options.reason
      }),
      status,
      ...(status === 'completed'
        ? {
            result: options.result ?? {
              ok: true,
              summary: `${options.name} completed`
            }
          }
        : {})
    }
  }
}

function buildTextItem(id: string, content: string, order: number): TextSegmentRenderItem {
  const segment: TextSegment = {
    type: 'text',
    segmentId: `tool-reason-text-${id}`,
    content,
    timestamp: now + order * 10
  }

  return {
    key: `committed-${segment.segmentId}`,
    layer: 'committed',
    sourceIndex: order,
    order,
    segment
  }
}

function buildReasoningItem(id: string, content: string, order: number, sourceIndex: number): SupportSegmentRenderItem {
  const segment: ReasoningSegment = {
    type: 'reasoning',
    segmentId: `tool-reason-thinking-${id}`,
    content,
    timestamp: now + order * 10,
    endedAt: now + order * 10 + 940
  }

  return {
    key: `committed-${segment.segmentId}`,
    layer: 'committed',
    sourceIndex,
    order,
    isStreamingTail: false,
    segment
  }
}

function buildToolCallItem(options: ToolCallMockOptions): SupportSegmentRenderItem {
  const argsWithReason = {
    ...options.args,
    [TOOL_CALL_REASON_PARAMETER_NAME]: options.reason
  }
  const status = options.status ?? 'completed'
  const contentStatus = status === 'running' ? 'running' : 'completed'
  const segment: ToolCallSegment = {
    type: 'toolCall',
    segmentId: `tool-reason-call-${options.id}`,
    name: options.name,
    timestamp: now + options.order * 10,
    cost: options.cost,
    isError: status === 'error',
    toolCallId: `tool-call-${options.id}`,
    toolCallIndex: options.sourceIndex,
    content: {
      toolName: options.name,
      args: options.argsAsJsonString ? JSON.stringify(argsWithReason, null, 2) : argsWithReason,
      status: contentStatus,
      result: options.result ?? {
        summary: `${options.name} mock result`,
        ok: status !== 'error'
      },
      error: status === 'error' ? 'Mock failure while testing the error visual state.' : undefined
    }
  }

  return {
    key: `committed-${segment.segmentId}`,
    layer: 'committed',
    sourceIndex: options.sourceIndex,
    order: options.order,
    isStreamingTail: options.isStreamingTail ?? false,
    segment
  }
}

function buildAssistantModel(args: {
  index: number
  isLatest?: boolean
  provider?: string
  model?: string
  textItems: TextSegmentRenderItem[]
  supportItems: SupportSegmentRenderItem[]
}): AssistantMessageLayoutProps {
  const textSegments = args.textItems.map(item => item.segment)

  return {
    shell: {
      index: args.index,
      isLatest: args.isLatest ?? false,
      onHover: noop
    },
    header: {
      badgeAnimate: args.isLatest ?? false,
      header: {
        badgeModel: args.model ?? 'Claude Sonnet 4.5',
        modelProvider: args.provider ?? 'anthropic',
        emotionLabel: 'focused',
        emotionEmoji: '◐',
        emotionIntensity: 2
      }
    },
    body: {
      index: args.index,
      isLatest: args.isLatest ?? false,
      onTypingChange: noop,
      transcript: {
        isOverlayPreview: false,
        textItems: args.textItems,
        supportItems: args.supportItems,
        supportUnits: buildSupportRenderUnits(args.supportItems)
      },
      textPlayback: {
        committed: {
          role: 'assistant',
          typewriterCompleted: true,
          segments: textSegments
        },
        preview: {
          role: 'assistant',
          source: 'stream_preview',
          typewriterCompleted: true,
          segments: []
        }
      }
    },
    footer: {
      isHovered: true,
      showOperations: false,
      showRegenerate: true,
      onCopyClick: noop,
      onRegenerateClick: noop,
      onEditClick: noop
    }
  }
}

const assistantCases: AssistantMockCase[] = [
  {
    id: 'single',
    title: 'Single Tool Reason',
    note: 'A short reason should read as a compact subtitle on the matching tool row.',
    viewport: 'wide',
    model: buildAssistantModel({
      index: 0,
      textItems: [
        buildTextItem(
          'single-answer',
          'I checked the assistant layout and placed the tool reason directly under the model badge so the reader sees why the next tool was used before the result card appears.',
          0
        )
      ],
      supportItems: [
        buildToolCallItem({
          id: 'read-layout',
          name: 'read_file',
          order: 1,
          sourceIndex: 0,
          reason: 'Inspect the current assistant message layout before adding a new tool row reason.',
          args: {
            path: 'src/renderer/src/features/chat/message/assistant-message/AssistantMessageLayout.tsx'
          },
          status: 'running',
          cost: 842,
          result: {
            lines: 44,
            component: 'AssistantMessageLayout'
          }
        })
      ]
    })
  },
  {
    id: 'multi',
    title: 'Multi Tool Reasons',
    note: 'Completed and running tool reasons should stay attached to their tool rows from old to new.',
    viewport: 'wide',
    model: buildAssistantModel({
      index: 1,
      textItems: [
        buildTextItem(
          'multi-answer',
          'The request touches schema, execution, and renderer surfaces. I verified the tool definitions first, then checked the UI rendering path before adjusting the display layer.',
          0
        )
      ],
      supportItems: [
        buildReasoningItem(
          'multi-plan',
          'Need to confirm the data crosses main, shared, and renderer boundaries before tightening the message UI.',
          1,
          0
        ),
        buildToolCallItem({
          id: 'rg-tools',
          name: 'search',
          order: 2,
          sourceIndex: 1,
          reason: 'Find every tool definition builder so the required reason parameter stays consistent across providers.',
          args: {
            query: 'ToolDefinition',
            path: 'src/shared/tools'
          },
          status: 'completed',
          cost: 319,
          result: {
            matches: 9,
            files: ['definitions-utils.ts', 'registry.ts']
          }
        }),
        buildToolCallItem({
          id: 'read-renderer',
          name: 'read_file',
          order: 3,
          sourceIndex: 2,
          reason: 'Read the assistant message renderer to place the reason on the exact tool trigger.',
          args: {
            path: 'src/renderer/src/features/chat/message/assistant-message/AssistantMessageLayout.tsx'
          },
          status: 'running',
          cost: 604,
          result: {
            lines: 48
          }
        }),
        buildToolCallItem({
          id: 'typecheck-web',
          name: 'shell',
          order: 4,
          sourceIndex: 3,
          reason: 'Run the renderer typecheck after wiring the reason component through the assistant message model.',
          args: {
            command: 'pnpm run typecheck:web'
          },
          status: 'completed',
          cost: 3218,
          result: {
            exitCode: 0
          }
        })
      ]
    })
  },
  {
    id: 'long-wrap',
    title: 'Long Reason Wrap',
    note: 'Long model-supplied reasons should wrap cleanly without widening the chat lane.',
    viewport: 'wide',
    model: buildAssistantModel({
      index: 2,
      textItems: [
        buildTextItem(
          'long-answer',
          'This case uses JSON-string args to exercise the parser path used by streamed tool calls and adapter payloads.',
          0
        )
      ],
      supportItems: [
        buildToolCallItem({
          id: 'long-reason',
          name: 'apply_patch',
          order: 1,
          sourceIndex: 0,
          reason: 'Patch only the tool row reason presentation after confirming that the reason argument is extracted from both object args and JSON-string args, then keep the visual treatment compact enough for a dense assistant transcript with multiple tool calls.',
          args: {
            files: [
              'model/toolCallReason.ts',
              'model-badge/ModelBadge.tsx'
            ],
            scope: 'renderer'
          },
          argsAsJsonString: true,
          status: 'running',
          cost: 1274,
          result: {
            changedFiles: 2,
            status: 'mocked'
          }
        })
      ]
    })
  },
  {
    id: 'narrow-running',
    title: 'Narrow + Running',
    note: 'The narrow frame catches line-height, icon, and tool-name wrapping issues before checking the real app.',
    viewport: 'narrow',
    model: buildAssistantModel({
      index: 3,
      isLatest: true,
      textItems: [
        buildTextItem(
          'narrow-answer',
          'I am still checking the renderer path. The tool row reason should stay readable while the tool card below is in a running state.',
          0
        )
      ],
      supportItems: [
        buildToolCallItem({
          id: 'running-read',
          name: 'read_file',
          order: 1,
          sourceIndex: 0,
          reason: 'Read the target component while the assistant response is still streaming so the preview state can show a reason immediately.',
          args: {
            path: 'src/renderer/src/features/chat/message/assistant-message/toolcall/ToolCallResult.tsx',
            helper: 'src/renderer/src/features/chat/message/assistant-message/model/toolCallReason.ts',
            start_line: 1,
            max_lines: 120
          },
          status: 'running',
          isStreamingTail: true,
          result: {
            status: 'loading'
          }
        })
      ]
    })
  },
  {
    id: 'error',
    title: 'Error Tool',
    note: 'Error tool cards should keep the reason neutral; the error state belongs to the tool result row.',
    viewport: 'narrow',
    model: buildAssistantModel({
      index: 4,
      textItems: [
        buildTextItem(
          'error-answer',
          'The first path lookup failed in this mock, so the assistant can still explain the intended tool call before recovering with another action.',
          0
        )
      ],
      supportItems: [
        buildToolCallItem({
          id: 'error-read',
          name: 'read_file',
          order: 1,
          sourceIndex: 0,
          reason: 'Attempt to open the expected renderer file before falling back to a broader file search.',
          args: {
            path: 'src/renderer/src/features/chat/message/assistant-message/MissingReason.tsx'
          },
          status: 'error',
          cost: 188,
          result: {
            code: 'ENOENT'
          }
        })
      ]
    })
  }
]

const sequentialToolSpecs: SequentialToolSpec[] = [
  {
    id: 'seq-search-definitions',
    name: 'search',
    reason: 'Find the tool definition helper before changing the schema surface.',
    args: {
      query: 'tool_call_reason',
      path: 'src/shared/tools'
    },
    cost: 420,
    result: {
      matches: 4,
      next: 'read matching files'
    }
  },
  {
    id: 'seq-read-renderer',
    name: 'read_file',
    reason: 'Read the renderer component after finding the shared field so the UI uses the same argument name.',
    args: {
      path: 'src/renderer/src/features/chat/message/assistant-message/model/toolCallReason.ts'
    },
    cost: 760,
    result: {
      lines: 118,
      component: 'toolCallReason'
    }
  },
  {
    id: 'seq-typecheck',
    name: 'shell',
    reason: 'Run the renderer typecheck once the reason display follows each tool call.',
    args: {
      command: 'pnpm run typecheck:web'
    },
    cost: 3120,
    result: {
      exitCode: 0,
      status: 'passed'
    }
  }
]

function buildSequentialAssistantModel(activeIndex: number): AssistantMessageLayoutProps {
  const activeTool = sequentialToolSpecs[activeIndex]
  const isDoneStage = activeIndex >= sequentialToolSpecs.length
  const visibleToolCount = isDoneStage
    ? sequentialToolSpecs.length
    : activeIndex + 1
  const activeToolName = activeTool?.name ?? 'complete'

  return buildAssistantModel({
    index: 5,
    isLatest: true,
    textItems: [
      buildTextItem(
        `sequential-${activeTool?.id ?? 'complete'}`,
        isDoneStage
          ? 'Sequential execution mock. All tool calls are complete, and each reason stays visible on its tool row.'
          : `Sequential execution mock. The active tool is ${activeToolName}; previous tool calls stay completed so the next reason can be reviewed in context.`,
        0
      )
    ],
    supportItems: sequentialToolSpecs.slice(0, visibleToolCount).map((tool, index) => {
      const isActiveTool = !isDoneStage && index === activeIndex
      return buildToolCallItem({
        id: tool.id,
        name: tool.name,
        order: index + 1,
        sourceIndex: index,
        reason: tool.reason,
        args: tool.args,
        status: isActiveTool ? 'running' : 'completed',
        isStreamingTail: isActiveTool,
        cost: isActiveTool ? undefined : tool.cost,
        result: tool.result
      })
    })
  })
}

function PreviewPanel({
  item
}: {
  item: AssistantMockCase
}) {
  const isNarrow = item.viewport === 'narrow'

  return (
    <section className="rounded-3xl border border-slate-200/72 bg-white/72 p-4 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/42">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {item.title}
          </h2>
          <p className="max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            {item.note}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-white/6 dark:text-slate-400">
          <Gauge className="h-3 w-3" />
          {isNarrow ? '420px' : '760px'}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-white/8 dark:bg-black/18">
        <div className={isNarrow ? 'w-[420px] max-w-full' : 'w-full max-w-[820px]'}>
          <AssistantMessageLayout {...item.model} />
        </div>
      </div>
    </section>
  )
}

function SequentialReasonSwitchPanel() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const model = useMemo(() => buildSequentialAssistantModel(activeIndex), [activeIndex])
  const stageCount = sequentialToolSpecs.length + 1

  useEffect(() => {
    if (!isAutoPlaying) {
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex(index => (index + 1) % stageCount)
    }, 2400)

    return () => window.clearInterval(intervalId)
  }, [isAutoPlaying, stageCount])

  return (
    <section className="rounded-3xl border border-slate-200/72 bg-white/72 p-4 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/42">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Sequential Reason Switch
          </h2>
          <p className="max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            Multiple tools execute one after another. The current tool stays running while earlier tool calls remain completed.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/6">
          <button
            type="button"
            onClick={() => setIsAutoPlaying(value => !value)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
            title={isAutoPlaying ? 'Pause' : 'Play'}
          >
            {isAutoPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveIndex(0)
              setIsAutoPlaying(false)
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
            title="Reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {sequentialToolSpecs.map((tool, index) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => {
              setActiveIndex(index)
              setIsAutoPlaying(false)
            }}
            className={[
              'rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
              index === activeIndex
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : index < activeIndex
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-300/12 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/6 dark:text-slate-400 dark:hover:bg-white/10'
            ].join(' ')}
          >
            {index + 1}. {tool.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setActiveIndex(sequentialToolSpecs.length)
            setIsAutoPlaying(false)
          }}
          className={[
            'rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            activeIndex >= sequentialToolSpecs.length
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/6 dark:text-slate-400 dark:hover:bg-white/10'
          ].join(' ')}
        >
          Done
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-white/8 dark:bg-black/18">
        <div className="w-full max-w-[820px]">
          <AssistantMessageLayout {...model} />
        </div>
      </div>
    </section>
  )
}

function ContainerWiringPanel() {
  const committedMessage = useMemo<ChatMessage>(() => ({
    role: 'assistant',
    model: 'Claude Sonnet 4.5',
    modelRef: {
      accountId: 'mock-anthropic',
      modelId: 'claude-sonnet-4-5'
    },
    content: '',
    segments: [
      buildContainerToolCallSegment({
        id: 'completed-search',
        name: 'search',
        reason: 'Find every place that assembles the assistant header props before changing the badge display.',
        status: 'completed',
        index: 0,
        args: {
          query: 'buildAssistantMessageHeaderModel',
          path: 'src/renderer/src/features/chat/message/assistant-message'
        },
        result: {
          matches: 2
        }
      }),
      buildContainerToolCallSegment({
        id: 'active-read',
        name: 'read_file',
        reason: 'Verify the production AssistantMessage container keeps reason data on each tool row.',
        status: 'running',
        index: 1,
        args: {
          path: 'src/renderer/src/features/chat/message/assistant-message/AssistantMessageContainer.tsx'
        }
      }),
      {
        type: 'text',
        segmentId: 'container-text-followup',
        content: 'This panel renders the real AssistantMessage container with mock segments, so it exercises the same prop chain used on the Home page.',
        timestamp: now + 30
      }
    ],
    typewriterCompleted: false
  }), [])

  return (
    <section className="rounded-3xl border border-slate-200/72 bg-white/72 p-4 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/42">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Container Wiring Mock
          </h2>
          <p className="max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            Renders `AssistantMessage` with mock tool-call segments to validate the production mapper and container path.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-300/12 dark:text-emerald-300">
          real container
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50/80 p-3 dark:border-white/8 dark:bg-black/18">
        <div className="w-full max-w-[820px]">
          <AssistantMessage
            index={0}
            committedMessage={committedMessage}
            isLatest={true}
            isHovered={false}
            onHover={noop}
            onCopyClick={noop}
          />
        </div>
      </div>
    </section>
  )
}

function PageStat({
  icon,
  label,
  value
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/8 dark:text-slate-300">
        {icon}
      </span>
      <div>
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
      </div>
    </div>
  )
}

export default function ToolCallReasonTraceTestPage() {
  const wideCases = assistantCases.filter(item => item.viewport === 'wide')
  const narrowCases = assistantCases.filter(item => item.viewport === 'narrow')
  const reasonCount = assistantCases.reduce(
    (count, item) => count + item.model.body.transcript.supportItems.filter(supportItem => supportItem.segment.type === 'toolCall').length,
    sequentialToolSpecs.length
  )

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900 dark:bg-[#0d1014] dark:text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.34] dark:opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(100,116,139,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.16) 1px, transparent 1px)',
          backgroundSize: '28px 28px'
        }}
      />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Tool Call Reason Playground
            </p>
            <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
              Mock tool row reasons inside the assistant message stack.
            </h1>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
              These cases render the real `AssistantMessageLayout` with mocked tool calls that include `tool_call_reason`, so spacing and wrapping can be tuned against actual text, reasoning, and tool-result rows.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <PageStat
              icon={<BrainCircuit className="h-4 w-4" />}
              label="Reason rows"
              value={String(reasonCount)}
            />
            <PageStat
              icon={<MessageSquareText className="h-4 w-4" />}
              label="Layouts"
              value="Wide + narrow + switch"
            />
          </div>
        </header>

        <ContainerWiringPanel />

        <SequentialReasonSwitchPanel />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="space-y-5">
            {wideCases.map(item => (
              <PreviewPanel key={item.id} item={item} />
            ))}
          </div>

          <div className="space-y-5">
            {narrowCases.map(item => (
              <PreviewPanel key={item.id} item={item} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
