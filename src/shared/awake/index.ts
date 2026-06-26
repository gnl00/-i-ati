export type AwakeMemorySource = 'pinned_preferences' | 'relevant_memories'

export type AwakeMemoryItem = {
  content: string
  category?: string
  importance?: string
  timestamp?: number
  source?: AwakeMemorySource
}

export type AwakeMemoryCandidate = AwakeMemoryItem & {
  id: string
  timestamp: number
  similarity?: number
  chat_id?: number
}

export type AwakeRetrievalPlan = {
  raw_query: string
  contextual_query: string
  signals: string[]
  top_k: number
  threshold: number
  confidence: 'low' | 'medium' | 'high'
}

export type AwakeRecentActivity = {
  source: 'activity_journal' | 'compressed_summary'
  id: string
  title: string
  summary: string
  category?: string
  level?: string
  chat_uuid?: string
  chat_title?: string
  timestamp: number
}

export type AwakeMemorySnapshot = {
  pinned_preferences: AwakeMemoryCandidate[]
  relevant_memories: AwakeMemoryCandidate[]
  retrieval_plan: AwakeRetrievalPlan
}

export type AwakeSnapshot = {
  version: 1
  chat_meta: {
    chat_id?: number
    chat_uuid?: string
    chat_title?: string
    workspace_path?: string
  }
  memories: AwakeMemoryItem[]
  work_context: {
    exists: boolean
    content: string
    truncated: boolean
  }
  emotion: {
    summary?: string
    baseline: {
      label: string
      intensity: number
      source: 'awake_carryover'
    }
    background?: {
      label: string
      intensity: number
    }
    accumulated: Array<{
      label: string
      description: string
      intensity: number
      decay: number
      updated_at: number
    }>
    recent_history: Array<{
      label: string
      intensity: number
      timestamp: number
      source: string
    }>
  }
  mood_notes: Array<{
    content: string
    ts: number
  }>
  recent_activities: AwakeRecentActivity[]
  session_meta: {
    chat_id?: number
    chat_uuid?: string
    chat_title?: string
    workspace_path?: string
  }
}
