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

export interface WorkingMemoryGetResponse {
  success: boolean
  chat_uuid?: string
  content: string
  exists: boolean
  file_path?: string
  message: string
}

export interface WorkingMemorySetResponse {
  success: boolean
  chat_uuid?: string
  updated: boolean
  skipped: boolean
  file_path?: string
  message: string
}
