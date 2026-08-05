/**
 * Memory Tools Type Definitions
 */

export interface MemoryItem {
  id: string
  context_origin: string
  context_en: string
  role: 'user' | 'assistant' | 'system'
  similarity: number
  timestamp: number
  metadata?: Record<string, any>
}

export interface MemoryRetrievalResponse {
  success: boolean
  count: number
  memories: MemoryItem[]
  message: string
}

export interface MemorySaveResponse {
  success: boolean
  memoryId?: string
  message: string
}

export interface MemoryUpdateResponse {
  success: boolean
  memoryId?: string
  message: string
}

export interface WorkContextGetResponse {
  success: boolean
  chat_uuid?: string
  content: string
  exists: boolean
  file_path?: string
  message: string
}

export interface WorkContextSetResponse {
  success: boolean
  chat_uuid?: string
  updated: boolean
  skipped: boolean
  file_path?: string
  message: string
}

export type SessionContextAction = 'get' | 'set'

export type SessionContextGetArgs = {
  chat_uuid?: string
}

export type SessionContextSetArgs = {
  content: string
  chat_uuid?: string
}

export type SessionContextGetResponse = WorkContextGetResponse
export type SessionContextSetResponse = WorkContextSetResponse

export type SessionContextArgs =
  | ({ action: 'get' } & SessionContextGetArgs)
  | ({ action: 'set' } & SessionContextSetArgs)

export type SessionContextResponse =
  | SessionContextGetResponse
  | SessionContextSetResponse
  | SessionContextErrorResponse

export interface SessionContextErrorResponse {
  success: false
  message: string
}
