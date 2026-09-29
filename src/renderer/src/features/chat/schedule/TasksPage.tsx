import ChatScheduleBoard from './ChatScheduleBoard'

export function TasksPage(): React.ReactElement {
  return (
    <section aria-label="Tasks page" className="fixed inset-x-0 bottom-0 top-10 z-40 flex flex-col bg-(--app-canvas) text-slate-700 dark:text-(--app-text-primary)">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 pb-4 pt-6 sm:px-6">
        <ChatScheduleBoard />
      </div>
    </section>
  )
}
