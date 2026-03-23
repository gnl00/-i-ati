import { ModelBadgeV2 } from '@renderer/components/chat/chatMessage/assistant-message/model-badge/ModelBadgeV2'
import { ModelBadgeV3 } from '@renderer/components/chat/chatMessage/assistant-message/model-badge/ModelBadgeV3'
import { ModelBadgeNext } from '@renderer/components/chat/chatMessage/assistant-message/model-badge/ModelBadgeNext'
import { ReasoningSegmentV2 } from '@renderer/components/chat/chatMessage/assistant-message/segments/ReasoningSegmentV2'
import { ReasoningSegmentNext } from '@renderer/components/chat/chatMessage/assistant-message/segments/ReasoningSegmentNext'
import { ToolCallResult } from '@renderer/components/chat/chatMessage/assistant-message/toolcall/ToolCallResult'
import { ToolCallResultNext } from '@renderer/components/chat/chatMessage/assistant-message/toolcall/ToolCallResultNext'
import { ToolCallResultNextOutput } from '@renderer/components/chat/chatMessage/assistant-message/toolcall/ToolCallResultNextOutput'

const mockReasoningSegment: ReasoningSegment = {
  type: 'reasoning',
  timestamp: Date.now(),
  content: [
    'I checked the current assistant message layout and compared the model header against the reasoning and tool call segments.',
    '',
    'The main issue is hierarchy: the model badge is too light, too short, and too close to a passive metadata chip.',
    '',
    'The next iteration should feel like an assistant identity header, not a faint status crumb.'
  ].join('\n')
}

const mockToolCallSegment: ToolCallSegment = {
  type: 'toolCall',
  name: 'read',
  timestamp: Date.now() + 2000,
  cost: 1680,
  isError: false,
  content: {
    toolName: 'read',
    status: 'completed',
    args: {
      file_path: 'src/renderer/src/components/chat/chatMessage/assistant-message/model-badge/ModelBadgeV2.tsx',
      start_line: 1,
      max_lines: 80
    },
    result: {
      summary: 'Loaded the current model badge implementation and compared it against reasoning and tool call visual weight.',
      lines: 42,
      file_path: 'src/renderer/src/components/chat/chatMessage/assistant-message/model-badge/ModelBadgeV2.tsx'
    }
  }
}

function DemoAssistantBubble({
  title,
  badge
}: {
  title: string
  badge: React.ReactNode
}) {
  return (
    <div className="rounded-[28px] border border-white/60 bg-white/68 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/42">
      <div className="mb-4 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
          Compare the top model header against the reasoning and tool call segments inside the same assistant bubble.
        </p>
      </div>

      <div className="space-y-2">
        {badge}

        <div className="max-w-3xl px-2">
          <p className="text-sm font-medium leading-7 text-slate-700 dark:text-slate-200">
            I reviewed the assistant message layout and found that the current model badge lacks visual authority compared with the reasoning and tool call sections below.
          </p>
        </div>

        <ReasoningSegmentV2
          segment={mockReasoningSegment}
          nextSegmentTimestamp={mockToolCallSegment.timestamp}
          isStreaming={false}
        />

        <ToolCallResult toolCall={mockToolCallSegment} index={0} />
      </div>
    </div>
  )
}

function DemoAssistantStack({
  title,
  badge,
  reasoning,
  toolcall
}: {
  title: string
  badge: React.ReactNode
  reasoning: React.ReactNode
  toolcall: React.ReactNode
}) {
  return (
    <div className="rounded-[28px] border border-white/60 bg-white/68 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/42">
      <div className="mb-4 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
          Compare the full assistant stack instead of looking at the model badge in isolation.
        </p>
      </div>

      <div className="space-y-2">
        {badge}

        <div className="max-w-3xl px-2">
          <p className="text-sm font-medium leading-7 text-slate-700 dark:text-slate-200">
            I reviewed the assistant message layout and found that the current model badge lacks visual authority compared with the reasoning and tool call sections below.
          </p>
        </div>

        {reasoning}
        {toolcall}
      </div>
    </div>
  )
}

export default function ModelBadgeTestPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="absolute inset-0">
        <div className="absolute left-8 top-12 h-72 w-72 rounded-full bg-sky-200/50 blur-3xl dark:bg-sky-500/12" />
        <div className="absolute right-8 top-28 h-80 w-80 rounded-full bg-amber-200/38 blur-3xl dark:bg-amber-400/10" />
        <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-emerald-200/34 blur-3xl dark:bg-emerald-500/8" />
        <div
          className="absolute inset-0 opacity-[0.4] dark:opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.16) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Model Badge Playground
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tune the assistant model header against reasoning and tool call hierarchy.
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            The current issue is not that the badge is ugly, but that it reads as weaker than the segments below it. This page compares the current `V2` against a stronger `V3` inside the same assistant message context.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <DemoAssistantBubble
            title="Current V2"
            badge={<ModelBadgeV2 model="MiniMax-M2.5" animate />}
          />

          <DemoAssistantBubble
            title="Proposed V3"
            badge={<ModelBadgeV3 model="MiniMax-M2.5" animate />}
          />

          <DemoAssistantBubble
            title="Fresh Next"
            badge={<ModelBadgeNext model="MiniMax-M2.5" provider="minimax" animate />}
          />
        </div>

        <div className="space-y-2 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Real Stack Baseline
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            Compare the current reasoning and tool call components against fresh `Next` variants.
          </h2>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <DemoAssistantStack
            title="Current Stack With ModelBadgeNext"
            badge={<ModelBadgeNext model="MiniMax-M2.5" provider="minimax" animate />}
            reasoning={(
              <ReasoningSegmentV2
                segment={mockReasoningSegment}
                nextSegmentTimestamp={mockToolCallSegment.timestamp}
                isStreaming={false}
              />
            )}
            toolcall={<ToolCallResult toolCall={mockToolCallSegment} index={0} />}
          />
          <DemoAssistantStack
            title="Next Stack With ModelBadgeNext"
            badge={<ModelBadgeNext model="MiniMax-M2.5" provider="minimax" animate />}
            reasoning={(
              <ReasoningSegmentNext
                segment={mockReasoningSegment}
                nextSegmentTimestamp={mockToolCallSegment.timestamp}
                isStreaming={false}
              />
            )}
            toolcall={<ToolCallResultNext toolCall={mockToolCallSegment} index={0} />}
          />
        </div>

        <div className="space-y-2 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Output Header Variant
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            Compare the current `Next` tool call card against an output-header-focused variant.
          </h2>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <DemoAssistantStack
            title="ToolCallResultNext"
            badge={<ModelBadgeNext model="MiniMax-M2.5" provider="minimax" animate />}
            reasoning={(
              <ReasoningSegmentNext
                segment={mockReasoningSegment}
                nextSegmentTimestamp={mockToolCallSegment.timestamp}
                isStreaming={false}
              />
            )}
            toolcall={<ToolCallResultNext toolCall={mockToolCallSegment} index={0} />}
          />
          <DemoAssistantStack
            title="ToolCallResultNextOutput"
            badge={<ModelBadgeNext model="MiniMax-M2.5" provider="minimax" animate />}
            reasoning={(
              <ReasoningSegmentNext
                segment={mockReasoningSegment}
                nextSegmentTimestamp={mockToolCallSegment.timestamp}
                isStreaming={false}
              />
            )}
            toolcall={<ToolCallResultNextOutput toolCall={mockToolCallSegment} index={0} />}
          />
        </div>
      </div>
    </div>
  )
}
