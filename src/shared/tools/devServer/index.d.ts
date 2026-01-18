/**
 * DevServer Tool - Type Definitions
 * Manages development server processes for workspace preview
 */

// ============================================
// DevServer Status Types
// ============================================

export type DevServerStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped'

export interface DevServerProcess {
  chatUuid: string
  process: any // ChildProcess
  status: DevServerStatus
  port: number | null
  logs: string[]
  error: string | null
  startTime: number
}

// ============================================
// IPC Request/Response Interfaces
// ============================================

// Check if preview.sh exists
export interface CheckPreviewShArgs {
  chatUuid: string
  customWorkspacePath?: string
}

export interface CheckPreviewShResponse {
  success: boolean
  exists: boolean
  error?: string
}

// Start dev server
export interface StartDevServerArgs {
  chatUuid: string
  customWorkspacePath?: string
}

export interface StartDevServerResponse {
  success: boolean
  message?: string
  error?: string
}

// Stop dev server
export interface StopDevServerArgs {
  chatUuid: string
}

export interface StopDevServerResponse {
  success: boolean
  message?: string
  error?: string
}

// Get dev server status
export interface GetDevServerStatusArgs {
  chatUuid: string
}

export interface GetDevServerStatusResponse {
  success: boolean
  status: DevServerStatus
  port: number | null
  logs: string[]
  error: string | null
}

// Get dev server logs
export interface GetDevServerLogsArgs {
  chatUuid: string
  limit?: number // Default: 50
}

export interface GetDevServerLogsResponse {
  success: boolean
  logs: string[]
  error?: string
}
