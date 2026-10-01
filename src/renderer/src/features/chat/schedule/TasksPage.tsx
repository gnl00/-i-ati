import ChatScheduleBoard from './ChatScheduleBoard'
import { SchedulerChats } from './SchedulerChats'

export function TasksPage(): React.ReactElement {
  return (
    <section aria-label="Tasks page" className="fixed inset-x-0 bottom-0 top-10 z-40 flex flex-col bg-(--app-canvas) text-slate-700 dark:text-(--app-text-primary)">
      <div className="mx-auto min-h-0 w-full max-w-5xl flex-1 grid grid-rows-[minmax(0,2fr)_minmax(0,3fr)] gap-6 overflow-hidden px-4 pb-4 pt-6 sm:px-6">
        <div className="relative flex min-h-0 flex-col">
          <ChatScheduleBoard />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-3 left-1/2 h-px w-12 -translate-x-1/2 translate-y-1/2 bg-(--app-border-subtle)" />
        </div>
        <SchedulerChats />
      </div>
    </section>
  )
}
