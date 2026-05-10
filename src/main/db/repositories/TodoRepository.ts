import type { TodoListFilters, TodoRow, TodoDao } from '@main/db/dao/TodoDao'

type TodoRepositoryDeps = {
  hasDb: () => boolean
  getTodoRepo: () => TodoDao | undefined
}

export class TodoRepository {
  constructor(private readonly deps: TodoRepositoryDeps) {}

  saveTodo(todo: TodoRow): void {
    this.requireTodoRepo().insertTodo(todo)
  }

  updateTodo(todo: TodoRow): void {
    this.requireTodoRepo().updateTodo(todo)
  }

  getTodoById(id: string): TodoRow | undefined {
    return this.requireTodoRepo().getById(id)
  }

  listTodos(filters: TodoListFilters): TodoRow[] {
    return this.requireTodoRepo().list(filters)
  }

  deleteTodo(id: string): void {
    this.requireTodoRepo().softDeleteById(id, Date.now())
  }

  private requireTodoRepo(): TodoDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getTodoRepo()
    if (!repo) throw new Error('Todo repository not initialized')
    return repo
  }
}
