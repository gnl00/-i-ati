export type LogSearchTarget = 'app' | 'perf'

export interface LogSearchArgs {
  target: LogSearchTarget
  date?: string
  query?: string
  scope?: string
  tail_lines?: number
  context_before?: number
  context_after?: number
  max_matches?: number
  case_sensitive?: boolean
}

export interface LogSearchLine {
  line: number
  text: string
}

export interface LogSearchBlock {
  start_line: number
  end_line: number
  match_lines?: number[]
  lines: LogSearchLine[]
}

export interface LogSearchResponse {
  success: boolean
  target: LogSearchTarget
  date: string
  file_name?: string
  available_files?: string[]
  total_lines?: number
  total_matches?: number
  returned_blocks?: number
  truncated?: boolean
  blocks?: LogSearchBlock[]
  error?: string
}
