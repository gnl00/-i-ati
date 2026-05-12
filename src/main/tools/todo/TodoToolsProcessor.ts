import { v4 as uuidv4 } from 'uuid'
import DatabaseService from '@main/db/DatabaseService'
import type {
  TodoAddResponse,
  TodoDeleteResponse,
  TodoItem,
  TodoListResponse,
  TodoPriority,
  TodoStatus,
  TodoUpdateResponse
} from '@shared/tools/todo'

type TodoAddArgs = {
  chat_uuid?: string
  title: string
  notes?: string
  priority?: TodoPriority
  tags?: string[]
}

type TodoListArgs = {
  chat_uuid?: string
  status?: TodoStatus | 'all'
  scope?: 'current_chat' | 'all'
  tag?: string
  priority?: TodoPriority
  limit?: number
}

type TodoUpdateArgs = {
  chat_uuid?: string
  id: string
  title?: string
  notes?: string | null
  status?: TodoStatus
  priority?: TodoPriority | null
  tags?: string[]
}

type TodoDeleteArgs = {
  chat_uuid?: string
  id: string
}

const VALID_STATUSES: TodoStatus[] = ['open', 'done']
const VALID_PRIORITIES: TodoPriority[] = ['low', 'medium', 'high']

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 50
  return Math.min(Math.max(Math.floor(limit as number), 1), 200)
}

function normalizeTags(tags?: string[]): string | null {
  const normalized = tags?.map(tag => tag.trim()).filter(Boolean) ?? []
  return normalized.length > 0 ? JSON.stringify(Array.from(new Set(normalized))) : null
}

function validatePriority(priority?: TodoPriority | null): string | undefined {
  if (priority === undefined || priority === null) return undefined
  return VALID_PRIORITIES.includes(priority) ? undefined : `Invalid priority: ${priority}`
}

function validateStatus(status?: TodoStatus): string | undefined {
  if (status === undefined) return undefined
  return VALID_STATUSES.includes(status) ? undefined : `Invalid status: ${status}`
}

export async function processTodoAdd(args: TodoAddArgs): Promise<TodoAddResponse> {
  try {
    if (!args.chat_uuid) {
      return { success: false, message: 'chat_uuid is required' }
    }

    const title = args.title?.trim()
    if (!title) {
      return { success: false, message: 'title is required' }
    }

    const priorityError = validatePriority(args.priority)
    if (priorityError) {
      return { success: false, message: priorityError }
    }

    const now = Date.now()
    const todo: TodoItem = {
      id: uuidv4(),
      chat_uuid: args.chat_uuid,
      title,
      notes: args.notes?.trim() || null,
      status: 'open',
      priority: args.priority ?? null,
      tags_json: normalizeTags(args.tags),
      created_at: now,
      updated_at: now,
      completed_at: null,
      deleted_at: null
    }

    DatabaseService.saveTodo(todo)
    return { success: true, todo }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TodoTools] Failed to add todo:', error)
    return { success: false, message }
  }
}

export async function processTodoList(args: TodoListArgs = {}): Promise<TodoListResponse> {
  try {
    const scope = args.scope ?? 'all'
    if (scope === 'current_chat' && !args.chat_uuid) {
      return { success: false, count: 0, todos: [], message: 'chat_uuid is required when scope=current_chat' }
    }

    const status = args.status ?? 'open'
    if (status !== 'all' && !VALID_STATUSES.includes(status)) {
      return { success: false, count: 0, todos: [], message: `Invalid status: ${status}` }
    }

    const priorityError = validatePriority(args.priority)
    if (priorityError) {
      return { success: false, count: 0, todos: [], message: priorityError }
    }

    const tag = args.tag?.trim()
    const todos = DatabaseService.listTodos({
      chatUuid: scope === 'current_chat' ? args.chat_uuid : undefined,
      status: status === 'all' ? undefined : status,
      tag: tag || undefined,
      priority: args.priority,
      limit: clampLimit(args.limit)
    })

    return {
      success: true,
      todos,
      count: todos.length,
      message: todos.length > 0 ? `Found ${todos.length} todos.` : 'No todos found.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TodoTools] Failed to list todos:', error)
    return { success: false, count: 0, todos: [], message }
  }
}

export async function processTodoUpdate(args: TodoUpdateArgs): Promise<TodoUpdateResponse> {
  try {
    const id = args.id?.trim()
    if (!id) {
      return { success: false, message: 'id is required' }
    }

    const existing = DatabaseService.getTodoById(id)
    if (!existing || existing.deleted_at !== null) {
      return { success: false, message: `Todo not found: ${id}` }
    }

    const statusError = validateStatus(args.status)
    if (statusError) {
      return { success: false, message: statusError }
    }

    const priorityError = validatePriority(args.priority)
    if (priorityError) {
      return { success: false, message: priorityError }
    }

    const now = Date.now()
    const nextStatus = args.status ?? existing.status
    const nextCompletedAt = nextStatus === 'done'
      ? existing.completed_at ?? now
      : null
    const nextTitle = args.title === undefined ? existing.title : args.title.trim()

    if (!nextTitle) {
      return { success: false, message: 'title must not be empty' }
    }

    const updated: TodoItem = {
      ...existing,
      title: nextTitle,
      notes: args.notes === undefined ? existing.notes : args.notes?.trim() || null,
      status: nextStatus,
      priority: args.priority === undefined ? existing.priority : args.priority,
      tags_json: args.tags === undefined ? existing.tags_json : normalizeTags(args.tags),
      completed_at: nextCompletedAt,
      updated_at: now
    }

    DatabaseService.updateTodo(updated)
    return { success: true, todo: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TodoTools] Failed to update todo:', error)
    return { success: false, message }
  }
}

export async function processTodoDelete(args: TodoDeleteArgs): Promise<TodoDeleteResponse> {
  try {
    const id = args.id?.trim()
    if (!id) {
      return { success: false, message: 'id is required' }
    }

    const existing = DatabaseService.getTodoById(id)
    if (!existing || existing.deleted_at !== null) {
      return { success: false, message: `Todo not found: ${id}` }
    }

    DatabaseService.deleteTodo(id)
    return { success: true, id }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TodoTools] Failed to delete todo:', error)
    return { success: false, message }
  }
}
