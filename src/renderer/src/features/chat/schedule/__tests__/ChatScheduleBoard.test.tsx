// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleEvent } from '@shared/schedule/events'
import type { ScheduleTask } from '@shared/tools/schedule'

const ipc = vi.hoisted(() => ({
  invokeDbMessageGetById: vi.fn(),
  invokeDbScheduledTasksList: vi.fn(),
  invokeDbScheduledTaskUpdateStatus: vi.fn(),
  subscribeScheduleEvents: vi.fn()
}))
vi.mock('@renderer/infrastructure/ipc', () => ipc)
const navigation = vi.hoisted(() => ({
  getAllChat: vi.fn(),
  switchWorkspace: vi.fn()
}))
vi.mock('@renderer/infrastructure/persistence/ChatRepository', () => ({
  getAllChat: navigation.getAllChat
}))
vi.mock('@renderer/features/workspace', () => ({
  switchWorkspace: navigation.switchWorkspace
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import ChatScheduleBoard, {
  scheduleLabel,
  taskTime
} from '../ChatScheduleBoard'
import { NextTaskSummary } from '../NextTaskSummary'
import { useChatStore } from '../../state/chatStore'
import { useSheetStore } from '../../state/sheetStore'

const task = (status: ScheduleTask['status'] = 'pending'): ScheduleTask => ({
  id: 'task-1',
  chat_uuid: 'other-chat',
  plan_id: null,
  goal: 'Check gold price',
  schedule_type: 'once',
  cron_expression: null,
  run_at: 1800000000000,
  timezone: null,
  status,
  payload: null,
  max_attempts: 1,
  last_run_at: null,
  last_run_status: null,
  run_count: 0,
  last_error: null,
  result_message_id: null,
  created_at: 1,
  updated_at: 1
})

describe('ChatScheduleBoard', () => {
  let root: Root
  let container: HTMLDivElement
  let emit: (event: ScheduleEvent) => void
  const unsubscribe = vi.fn()
  const update = async (value: ScheduleTask): Promise<void> => {
    await act(async () =>
      emit({
        type: 'schedule.updated',
        payload: { task: value },
        sequence: 1,
        timestamp: 1
      })
    )
  }
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    ipc.invokeDbScheduledTasksList.mockResolvedValue([])
    ipc.subscribeScheduleEvents.mockImplementation((handler) => {
      emit = handler
      return unsubscribe
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  it.each(['pending', 'failed'] as const)('groups execution errors with %s state', async (status) => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([
      { ...task(status), last_error: 'fetch failed' }
    ])
    await act(async () => root.render(<ChatScheduleBoard />))
    const label = Array.from(container.querySelectorAll('dt')).find(
      (item) => item.textContent === 'State'
    )!
    const value = label.nextElementSibling!
    expect(value.textContent).toContain(status === 'pending' ? 'Pending' : 'Failed')
    expect(value.querySelector('button')?.textContent).toBe(
      status === 'pending' ? 'Last run failed' : 'fetch failed'
    )
    expect(value.querySelector('button')?.getAttribute('aria-label')).toBe('Execution error: fetch failed')
  })
  it('shows only the earliest pending task and opens the full page', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([
      { ...task('running'), id: 'running', goal: 'Already running', run_at: 1 },
      { ...task(), id: 'later', goal: 'Later task', run_at: 200 },
      { ...task(), goal: 'Next task', run_at: 100 }
    ])
    useSheetStore.setState({ sheetOpenState: true })
    useChatStore.setState({
      tasksPageOpen: false,
      artifactsActiveTab: 'files',
      artifactsPanelOpen: true
    })
    await act(async () => root.render(<NextTaskSummary />))
    expect(container.textContent).toContain('Next task')
    expect(container.textContent).not.toContain('Already running')
    expect(container.textContent).not.toContain('Later task')
    expect(container.textContent).not.toContain('Pending')
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open Tasks"]')!
        .click()
    )
    expect(useSheetStore.getState().sheetOpenState).toBe(false)
    expect(useChatStore.getState()).toMatchObject({
      tasksPageOpen: true,
      artifactsActiveTab: 'files',
      artifactsPanelOpen: true
    })
    await update({ ...task(), goal: 'New next task', run_at: 50 })
    expect(container.textContent).toContain('New next task')
  })
  it('shows skipped one-time tasks in history with their reason and allows dismissal', async () => {
    const skipped = {
      ...task('skipped'),
      id: 'skipped',
      goal: 'Expired reminder',
      last_run_status: 'skipped' as const,
      last_error: 'Scheduled occurrence exceeded the 15 minute grace window'
    }
    ipc.invokeDbScheduledTasksList.mockResolvedValue([task(), skipped])
    ipc.invokeDbScheduledTaskUpdateStatus.mockResolvedValue({
      ...skipped,
      status: 'dismissed'
    })
    await act(async () => root.render(<ChatScheduleBoard />))
    const filter = (label: string): HTMLButtonElement =>
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.startsWith(label)
      )!
    expect(filter('History').textContent).toBe('History1')
    await act(async () => filter('Active').click())
    expect(container.textContent).not.toContain('Expired reminder')
    await act(async () => filter('History').click())
    expect(container.querySelector('[aria-label="Expired reminder (Skipped)"]')).toBeTruthy()
    const state = Array.from(container.querySelectorAll('dt')).find(
      (item) => item.textContent === 'State'
    )!.nextElementSibling!
    expect(state.textContent).toContain('Skipped')
    expect(state.textContent).toContain(skipped.last_error)
    expect(state.querySelector('button')?.getAttribute('aria-label')).toBe(`Skipped run: ${skipped.last_error}`)
    expect(container.textContent).not.toContain('Last run failed')
    expect(container.querySelector('[aria-label="Cancel task"]')).toBeNull()
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Dismiss task"]')!.click()
    )
    expect(ipc.invokeDbScheduledTaskUpdateStatus).toHaveBeenCalledWith({
      id: skipped.id,
      status: 'dismissed',
      lastError: skipped.last_error
    })
    expect(container.textContent).toContain('No task history')
  })
  it('keeps recurring tasks active and labels a skipped last run with its reason', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([{
      ...task(),
      schedule_type: 'cron',
      cron_expression: '0 9 * * *',
      last_run_status: 'skipped',
      last_error: 'Older occurrences were folded into the latest occurrence'
    }])
    await act(async () => root.render(<ChatScheduleBoard />))
    const state = Array.from(container.querySelectorAll('dt')).find(
      (item) => item.textContent === 'State'
    )!.nextElementSibling!
    expect(state.textContent).toContain('Pending')
    expect(state.querySelector('button')?.textContent).toBe('Last run skipped')
    expect(state.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Skipped run: Older occurrences were folded into the latest occurrence'
    )
    expect(container.textContent).not.toContain('Last run failed')
    expect(container.querySelector('[aria-label="Cancel task"]')).toBeTruthy()
  })
  it('keeps an empty summary accessible for viewing task history', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([task('completed')])
    await act(async () => root.render(<NextTaskSummary />))
    expect(container.textContent).toContain('No upcoming tasks')
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Open Tasks"]')
        ?.disabled
    ).toBe(false)
  })
  it('filters task history and dismisses completed tasks', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([
      task(),
      { ...task('completed'), id: 'done', goal: 'Finished task' }
    ])
    ipc.invokeDbScheduledTaskUpdateStatus.mockResolvedValue({
      ...task('dismissed'),
      id: 'done'
    })
    await act(async () => root.render(<ChatScheduleBoard />))
    const history = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.startsWith('History')
    )!
    await act(async () => history.click())
    expect(container.textContent).toContain('Finished task')
    expect(container.textContent).not.toContain('Check gold price')
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Dismiss task"]')!
        .click()
    )
    expect(container.textContent).toContain('No task history')
  })
  it('cancels only after confirmation and selects the remaining task', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([
      task(),
      {
        ...task(),
        id: 'remaining',
        goal: 'Remaining task',
        run_at: 1800000000100
      }
    ])
    ipc.invokeDbScheduledTaskUpdateStatus.mockResolvedValue(task('cancelled'))
    await act(async () => root.render(<ChatScheduleBoard />))
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Cancel task"]')!
        .click()
    )
    expect(ipc.invokeDbScheduledTaskUpdateStatus).not.toHaveBeenCalled()
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Cancel task"]')!
        .click()
    )
    expect(ipc.invokeDbScheduledTaskUpdateStatus).toHaveBeenCalledWith({
      id: 'task-1',
      status: 'cancelled',
      lastError: 'Cancelled by user'
    })
    expect(container.querySelector('aside h3')?.textContent).toBe(
      'Remaining task'
    )
  })
  it('merges live updates over a loading snapshot and releases its subscription', async () => {
    let resolve!: (tasks: ScheduleTask[]) => void
    ipc.invokeDbScheduledTasksList.mockReturnValue(
      new Promise<ScheduleTask[]>((done) => {
        resolve = done
      })
    )
    await act(async () => root.render(<ChatScheduleBoard />))
    expect(container.textContent).toContain('Loading schedules')
    expect(container.textContent).not.toContain('No Tasks')
    await update(task('running'))
    await act(async () => resolve([task()]))
    expect(container.textContent).toContain('Check gold price')
    expect(container.querySelector('[aria-label="Cancel task"]')).toBeTruthy()
    expect(container.textContent).not.toContain('PendingOne time')
    await update(task('cancelled'))
    expect(container.textContent).toContain('No Tasks')
    await act(async () => root.render(null))
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('shows load failures and reads a fresh snapshot on reopening', async () => {
    ipc.invokeDbScheduledTasksList.mockRejectedValueOnce(new Error('offline'))
    await act(async () => root.render(<ChatScheduleBoard />))
    expect(container.textContent).toContain('Failed to load schedule tasks')
    expect(container.textContent).not.toContain('No Tasks')
    await act(async () => root.render(null))
    ipc.invokeDbScheduledTasksList.mockResolvedValue([task('completed')])
    await act(async () => root.render(<ChatScheduleBoard />))
    expect(container.textContent).toContain('Completed')
    expect(ipc.invokeDbScheduledTasksList).toHaveBeenCalledTimes(2)
  })
  it('requires confirmation for cancellation and restores the task on failure', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([task()])
    ipc.invokeDbScheduledTaskUpdateStatus.mockRejectedValueOnce(
      new Error('offline')
    )
    await act(async () => root.render(<ChatScheduleBoard />))
    const cancel = (): HTMLButtonElement =>
      container.querySelector('[aria-label="Cancel task"]')!
    await act(async () => cancel().click())
    expect(ipc.invokeDbScheduledTaskUpdateStatus).not.toHaveBeenCalled()
    expect(container.querySelector('[aria-label="Keep task"]')).toBeTruthy()
    await act(async () => cancel().click())
    expect(ipc.invokeDbScheduledTaskUpdateStatus).toHaveBeenCalledWith({
      id: 'task-1',
      status: 'cancelled',
      lastError: 'Cancelled by user'
    })
    expect(container.textContent).toContain('Check gold price')
    expect(cancel().disabled).toBe(false)
    ipc.invokeDbScheduledTaskUpdateStatus.mockResolvedValue(task('cancelled'))
    await act(async () => cancel().click())
    await update(task('cancelled'))
    expect(container.textContent).toContain('No Tasks')
  })
  it('formats calendar days across year boundaries and preserves complex cron rules', () => {
    const now = new Date(2026, 11, 31, 23, 59)
    expect(taskTime(new Date(2026, 11, 31, 16).getTime(), now)).toContain(
      'Today'
    )
    expect(taskTime(new Date(2027, 0, 1, 11).getTime(), now)).toContain(
      'Tomorrow'
    )
    expect(taskTime(new Date(2025, 0, 1, 11).getTime(), now)).toContain('2025')
    expect(
      scheduleLabel({
        ...task(),
        schedule_type: 'cron',
        cron_expression: '5 9 * * *'
      })
    ).toBe('Daily at 09:05')
    expect(
      scheduleLabel({
        ...task(),
        schedule_type: 'cron',
        cron_expression: '0 9 * * 1-5'
      })
    ).toBe('Cron: 0 9 * * 1-5')
  })
  it('keeps selection stable and cancellation independent from task selection', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([
      task(),
      { ...task(), id: 'second', goal: 'Second task', run_at: 1800000000100 }
    ])
    await act(async () => root.render(<ChatScheduleBoard />))
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Second task"]'
    )!
    await act(async () => trigger.click())
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Cancel task"]')!
        .click()
    )
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    expect(ipc.invokeDbScheduledTaskUpdateStatus).not.toHaveBeenCalled()
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Keep task"]')!
        .click()
    )
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    await update({ ...task(), id: 'second', goal: 'Updated selected task' })
    expect(container.querySelector('aside h3')?.textContent).toBe(
      'Updated selected task'
    )
    await update({ ...task('cancelled'), id: 'second' })
    expect(container.querySelector('aside h3')?.textContent).toBe(
      'Check gold price'
    )
  })
  it('expands real task details and opens the associated chat', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([
      {
        ...task(),
        schedule_type: 'cron',
        cron_expression: '0 11 * * *',
        timezone: 'Asia/Shanghai',
        result_message_id: 123
      }
    ])
    ipc.invokeDbMessageGetById.mockResolvedValue({
      chatUuid: 'execution-chat'
    })
    navigation.getAllChat.mockResolvedValue([
      { id: 42, uuid: 'execution-chat' }
    ])
    navigation.switchWorkspace.mockResolvedValue({ success: true })
    const hydrateChat = vi.fn(async () => {
      useChatStore.setState({ currentChatUuid: 'execution-chat' })
    })
    const original = useChatStore.getState().hydrateChat
    useChatStore.setState({
      tasksPageOpen: true,
      currentChatUuid: 'current',
      hydrateChat
    })
    useSheetStore.setState({ sheetOpenState: false })
    try {
      await act(async () => root.render(<ChatScheduleBoard />))
      expect(container.querySelector('aside h3')?.textContent).toBe(
        'Check gold price'
      )
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>('[aria-label="Check gold price"]')!
          .click()
      )
      expect(
        container.querySelector('[aria-label="Task details"]')
      ).toBeTruthy()
      expect(container.textContent).toContain('Asia/Shanghai')
      expect(
        container.querySelector(
          '[aria-label="Check gold price"][aria-pressed="true"]'
        )
      ).toBeTruthy()
      const open = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Open chat')
      )!
      await act(async () => open.click())
      expect(ipc.invokeDbMessageGetById).toHaveBeenCalledWith(123)
      expect(hydrateChat).toHaveBeenCalledWith(42, {
        isCurrent: expect.any(Function)
      })
      expect(useChatStore.getState().tasksPageOpen).toBe(false)
    } finally {
      useChatStore.setState({ hydrateChat: original })
    }
  })
  it('keeps Tasks open for missing chats and ignores late navigation after leaving', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([task()])
    useChatStore.setState({ tasksPageOpen: true, currentChatUuid: 'current' })
    useSheetStore.setState({ sheetOpenState: false })
    ipc.invokeDbMessageGetById.mockResolvedValue({
      chatUuid: 'execution-chat'
    })
    ipc.invokeDbScheduledTasksList.mockResolvedValue([
      { ...task(), result_message_id: 123 }
    ])
    navigation.getAllChat.mockResolvedValue([])
    await act(async () => root.render(<ChatScheduleBoard />))
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Check gold price"]')!
        .click()
    )
    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Open chat')
    )!
    await act(async () => open.click())
    expect(useChatStore.getState().tasksPageOpen).toBe(true)
    expect(open.disabled).toBe(false)
    let resolve!: (chats: unknown[]) => void
    navigation.getAllChat.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    await act(async () => open.click())
    expect(open.disabled).toBe(true)
    useChatStore.setState({ tasksPageOpen: false })
    await act(async () => resolve([{ id: 42, uuid: 'other-chat' }]))
    expect(navigation.switchWorkspace).not.toHaveBeenCalled()
  })
  it('shows a placeholder before execution and exposes the link when a result arrives', async () => {
    ipc.invokeDbScheduledTasksList.mockResolvedValue([task()])
    await act(async () => root.render(<ChatScheduleBoard />))
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Check gold price"]')!
        .click()
    )
    expect(container.textContent).toContain('No execution result yet')
    expect(container.textContent).not.toContain('Open chat')
    expect(ipc.invokeDbMessageGetById).not.toHaveBeenCalled()
    await update({ ...task(), result_message_id: 123, run_count: 1 })
    expect(container.textContent).toContain('Open chat')
  })
})
