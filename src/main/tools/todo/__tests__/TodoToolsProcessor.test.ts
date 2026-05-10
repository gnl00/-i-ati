import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodoItem } from '@shared/tools/todo'
import {
  processTodoAdd,
  processTodoDelete,
  processTodoList,
  processTodoUpdate
} from '../TodoToolsProcessor'

const todoStore: TodoItem[] = []

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveTodo: vi.fn((todo: TodoItem) => {
      todoStore.push({ ...todo })
    }),
    listTodos: vi.fn((filters: {
      chatUuid?: string
      status?: string
      tag?: string
      priority?: string
      limit: number
    }) => {
      return todoStore
        .filter(todo => todo.deleted_at === null)
        .filter(todo => !filters.chatUuid || todo.chat_uuid === filters.chatUuid)
        .filter(todo => !filters.status || todo.status === filters.status)
        .filter(todo => !filters.tag || todo.tags_json?.includes(`"${filters.tag}"`))
        .filter(todo => !filters.priority || todo.priority === filters.priority)
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, filters.limit)
        .map(todo => ({ ...todo }))
    }),
    getTodoById: vi.fn((id: string) => {
      const todo = todoStore.find(item => item.id === id)
      return todo ? { ...todo } : undefined
    }),
    updateTodo: vi.fn((todo: TodoItem) => {
      const index = todoStore.findIndex(item => item.id === todo.id)
      if (index >= 0) {
        todoStore[index] = { ...todo }
      }
    }),
    deleteTodo: vi.fn((id: string) => {
      const todo = todoStore.find(item => item.id === id)
      if (!todo) return
      todo.deleted_at = Date.now()
      todo.updated_at = Date.now()
    })
  }
}))

const now = new Date('2026-05-09T08:00:00.000Z')

describe('TodoToolsProcessor', () => {
  beforeEach(() => {
    todoStore.length = 0
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.clearAllMocks()
  })

  it('requires chat_uuid when adding a todo', async () => {
    const result = await processTodoAdd({ title: 'Ship todo tool' })

    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid')
    expect(todoStore).toHaveLength(0)
  })

  it('adds a todo with normalized fields', async () => {
    const result = await processTodoAdd({
      chat_uuid: 'chat-1',
      title: '  Ship todo tool  ',
      notes: '  implement processor  ',
      priority: 'high',
      tags: [' tools ', 'tools', ' db ']
    })

    expect(result.success).toBe(true)
    expect(todoStore).toHaveLength(1)
    expect(result.todo).toEqual(expect.objectContaining({
      chat_uuid: 'chat-1',
      title: 'Ship todo tool',
      notes: 'implement processor',
      status: 'open',
      priority: 'high',
      completed_at: null,
      deleted_at: null
    }))
    expect(result.todo?.tags_json).toBe(JSON.stringify(['tools', 'db']))
  })

  it('lists open todos across chats by default', async () => {
    todoStore.push(
      makeTodo({ id: 'todo-1', chat_uuid: 'chat-1', title: 'Open task', status: 'open' }),
      makeTodo({ id: 'todo-2', chat_uuid: 'chat-1', title: 'Done task', status: 'done' }),
      makeTodo({ id: 'todo-3', chat_uuid: 'chat-2', title: 'Other chat', status: 'open' })
    )

    const result = await processTodoList({})

    expect(result.success).toBe(true)
    expect(result.todos?.map(todo => todo.id)).toEqual(['todo-1', 'todo-3'])
  })

  it('requires chat_uuid for current_chat list scope', async () => {
    const result = await processTodoList({ scope: 'current_chat' })

    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid')
  })

  it('lists open todos for current chat when scope=current_chat', async () => {
    todoStore.push(
      makeTodo({ id: 'todo-1', chat_uuid: 'chat-1', title: 'Open task', status: 'open' }),
      makeTodo({ id: 'todo-3', chat_uuid: 'chat-2', title: 'Other chat', status: 'open' })
    )

    const result = await processTodoList({ scope: 'current_chat', chat_uuid: 'chat-1' })

    expect(result.success).toBe(true)
    expect(result.todos?.map(todo => todo.id)).toEqual(['todo-1'])
  })

  it('filters todos by priority', async () => {
    todoStore.push(
      makeTodo({ id: 'todo-1', chat_uuid: 'chat-1', priority: 'high' }),
      makeTodo({ id: 'todo-2', chat_uuid: 'chat-2', priority: 'low' }),
      makeTodo({ id: 'todo-3', chat_uuid: 'chat-3', priority: 'high' })
    )

    const result = await processTodoList({ priority: 'high' })

    expect(result.success).toBe(true)
    expect(result.todos?.map(todo => todo.id)).toEqual(['todo-1', 'todo-3'])
  })

  it('updates status to done and sets completed_at', async () => {
    todoStore.push(makeTodo({ id: 'todo-1', chat_uuid: 'chat-1', status: 'open' }))

    const result = await processTodoUpdate({
      chat_uuid: 'chat-1',
      id: 'todo-1',
      status: 'done'
    })

    expect(result.success).toBe(true)
    expect(result.todo?.status).toBe('done')
    expect(result.todo?.completed_at).toBe(now.getTime())
    expect(todoStore[0].completed_at).toBe(now.getTime())
  })

  it('reopens done todos and clears completed_at', async () => {
    todoStore.push(makeTodo({
      id: 'todo-1',
      chat_uuid: 'chat-1',
      status: 'done',
      completed_at: now.getTime() - 1000
    }))

    const result = await processTodoUpdate({
      chat_uuid: 'chat-1',
      id: 'todo-1',
      status: 'open'
    })

    expect(result.success).toBe(true)
    expect(result.todo?.status).toBe('open')
    expect(result.todo?.completed_at).toBeNull()
  })

  it('rejects update when todo belongs to another chat', async () => {
    todoStore.push(makeTodo({ id: 'todo-1', chat_uuid: 'owner-chat' }))

    const result = await processTodoUpdate({
      chat_uuid: 'other-chat',
      id: 'todo-1',
      title: 'Changed'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid')
    expect(todoStore[0].title).toBe('Todo')
  })

  it('soft deletes a todo', async () => {
    todoStore.push(makeTodo({ id: 'todo-1', chat_uuid: 'chat-1' }))

    const result = await processTodoDelete({
      chat_uuid: 'chat-1',
      id: 'todo-1'
    })

    expect(result.success).toBe(true)
    expect(todoStore[0].deleted_at).toBe(now.getTime())
  })
})

function makeTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 'todo-id',
    chat_uuid: 'chat-1',
    title: 'Todo',
    notes: null,
    status: 'open',
    priority: null,
    tags_json: null,
    created_at: now.getTime(),
    updated_at: now.getTime(),
    completed_at: null,
    deleted_at: null,
    ...overrides
  }
}
