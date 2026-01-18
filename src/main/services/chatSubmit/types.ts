export type ToolCallStatus = 'pending' | 'executing' | 'success' | 'failed' | 'aborted'

export interface ToolCall {
  id: string
  name: string
  args: string
  status: ToolCallStatus
  result?: any
  error?: string
  cost?: number
  index?: number
}

export interface ToolCallProps {
  id?: string
  index?: number
  function: string
  args: string
}
