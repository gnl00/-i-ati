import { CommandConfirmation, type CommandConfirmationRequest } from '@renderer/components/chat/chatMessage/assistant-message/CommandConfirmation'

const mockRequests: CommandConfirmationRequest[] = [
  {
    command: 'git checkout -b feature/task-plan-bar && pnpm typecheck',
    risk_level: 'risky',
    execution_reason: 'Create an isolated branch and validate the renderer changes before continuing.',
    possible_risk: 'The command may create local git state and run project-wide type checks that take time.',
    risk_score: 4
  },
  {
    command: 'rm -rf ./dist && rm -rf ./out && pnpm build',
    risk_level: 'dangerous',
    execution_reason: 'Clear generated build artifacts before producing a fresh desktop bundle.',
    possible_risk: 'This removes local generated directories and may discard artifacts you wanted to inspect.',
    risk_score: 8
  }
]

export default function CommandConfirmationTestPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="absolute inset-0">
        <div className="absolute left-0 top-0 h-80 w-80 rounded-full bg-sky-200/45 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-rose-200/35 blur-3xl dark:bg-rose-500/10" />
        <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-amber-200/30 blur-3xl dark:bg-amber-400/8" />
        <div
          className="absolute inset-0 opacity-[0.38] dark:opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.16) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Command Confirmation Playground
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tune command approval UI outside the live chat flow.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            This page previews risky and dangerous command confirmations inside a faux assistant bubble so spacing, blur, and action density can be iterated in isolation.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[28px] border border-white/55 bg-white/60 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/38">
            <div className="space-y-5">
              <div className="max-w-3xl rounded-3xl bg-white/72 px-4 py-3 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.45)] backdrop-blur-md dark:bg-slate-900/48">
                <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">
                  I found a command that may affect your local workspace. Please review it before execution.
                </p>
              </div>

              {mockRequests.map((request) => (
                <div
                  key={`${request.risk_level}-${request.command}`}
                  className="max-w-3xl rounded-[28px] bg-white/70 px-3 py-3 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md dark:bg-slate-900/42"
                >
                  <CommandConfirmation
                    request={request}
                    onConfirm={() => {}}
                    onCancel={() => {}}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/55 bg-white/60 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/38">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                Notes
              </p>
              <ul className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                <li>Risky confirmation should stay light and embedded inside assistant flow.</li>
                <li>Dangerous confirmation should read clearly as destructive without becoming a full warning card.</li>
                <li>Command block, reason text, and action density should remain legible on both light and dark backgrounds.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
