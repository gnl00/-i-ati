export type AwakeMemoryItem = {
  id: string
  content: string
  context_en?: string
  category?: string
  importance?: string
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
  content?: string
  category?: string
  level?: string
  chat_uuid?: string
  chat_title?: string
  timestamp: number
}

export type AwakeSnapshot = {
  version: 1
  generated_at: number
  memory: {
    pinned_preferences: AwakeMemoryItem[]
    relevant_memories: AwakeMemoryItem[]
    retrieval_plan: AwakeRetrievalPlan
  }
  work_context: {
    exists: boolean
    content: string
    truncated: boolean
  }
  emotion: {
    baseline: {
      label: string
      intensity: number
      source: 'awake_carryover'
      updated_at?: number
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
    last_active_at?: number
    workspace_path?: string
  }
}
