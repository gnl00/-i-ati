export type TodoStatus = 'open' | 'done'

export type TodoPriority = 'low' | 'medium' | 'high'

export interface TodoItem {
  id: string
  chat_uuid: string | null
  title: string
  notes: string | null
  status: TodoStatus
  priority: TodoPriority | null
  tags_json: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
  deleted_at: number | null
}

export interface TodoAddResponse {
  success: boolean
  todo?: TodoItem
  message?: string
}

export interface TodoListResponse {
  success: boolean
  todos?: TodoItem[]
  count?: number
  message?: string
}

export interface TodoUpdateResponse {
  success: boolean
  todo?: TodoItem
  message?: string
}

export interface TodoDeleteResponse {
  success: boolean
  id?: string
  message?: string
}
