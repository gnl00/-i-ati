import { useState } from 'react'
import { ArtifactsPreviewErrorState } from '@renderer/components/artifacts/ArtifactsPreviewErrorState'
import { ArtifactsPreviewShell } from '@renderer/components/artifacts/ArtifactsPreviewShell'
import { ArrowRight, Sparkles } from 'lucide-react'

const mockLogs = [
  '> landing-page@1.0.0 dev',
  '> vite',
  'Port 5173 is in use, trying another one...',
  'VITE v5.4.21 ready in 143 ms',
  '➜  Local:   http://localhost:5174/',
  '➜  Network: use --host to expose',
  '[system] Waiting for preview runtime to become reachable...',
  '[system] HTTP probe did not succeed before timeout window closed'
]

const mockError = 'Preview runtime never became reachable from the desktop app, even though the local dev process printed a startup banner.'

export default function ArtifactsPreviewErrorStateTestPage() {
  const [showLogsV2, setShowLogsV2] = useState(true)

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-6 py-8">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Artifact Preview Error Playground
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Compare preview success and preview failure inside the same shell.
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            Use this page to tune the relationship between the happy path and the failure path. The left column is a mock successful preview, and the right column is the current V2 error treatment.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/70 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.32)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/40">
            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
              <p className="text-sm font-semibold">Mock Preview Success</p>
            </div>
            <MockPreviewSuccess />
          </section>

          <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/70 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.32)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/40">
            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
              <p className="text-sm font-semibold">Preview Failure V2</p>
            </div>
            <ArtifactsPreviewErrorState
              error={mockError}
              logs={mockLogs}
              port={5174}
              showLogs={showLogsV2}
              setShowLogs={setShowLogsV2}
              onRetry={() => {}}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function MockPreviewSuccess() {
  return (
    <ArtifactsPreviewShell
      address="localhost:5174"
      statusDot="running"
      onReload={() => {}}
      onOpenExternal={() => {}}
      onStop={() => {}}
    >
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 p-4 md:p-5">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-950/82">
          <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                  Preview Live
                </p>
                <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Landing Page Runtime Connected
                </h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  The development server is reachable and the iframe is rendering the latest artifact output.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <Sparkles className="h-3.5 w-3.5" />
                Synced
              </div>
            </div>
          </div>

          <div className="bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_42%,#eef2ff_100%)] px-5 py-6 dark:bg-[linear-gradient(180deg,rgba(69,26,3,0.24)_0%,rgba(9,9,11,0.92)_42%,rgba(30,27,75,0.46)_100%)]">
            <div className="overflow-hidden rounded-[1.35rem] border border-orange-200/70 bg-white/90 shadow-[0_28px_60px_-42px_rgba(234,88,12,0.4)] dark:border-orange-900/40 dark:bg-zinc-950/70">
              <div className="px-6 py-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-200">
                  Spring Launch
                </div>
                <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                  Bold product storytelling rendered inside the artifact preview.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  This mock success state stands in for the iframe content so the surrounding shell can be compared directly against the failure treatment.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-950">
                    Explore Launch
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                    View Components
                  </button>
                </div>
              </div>

              <div className="grid gap-3 border-t border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/55 md:grid-cols-3">
                {[
                  ['Hero', 'Responsive headline, CTA row, and campaign chip'],
                  ['Metrics', 'Three compact stats blocks below the fold'],
                  ['Motion', 'Subtle reveal transitions in the runtime preview']
                ].map(([title, description]) => (
                  <div key={title} className="rounded-2xl border border-zinc-200/80 bg-white/85 p-3 dark:border-zinc-800 dark:bg-zinc-950/70">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ArtifactsPreviewShell>
  )
}
