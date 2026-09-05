export class AbortError extends Error {
  constructor(message: string = 'Request aborted') {
    super(message)
    this.name = 'AbortError'
  }
}

export class ToolExecutionError extends Error {
  public readonly code?: string
  public readonly originalError: Error

  constructor(toolName: string, originalError: Error) {
    super(`Tool "${toolName}" execution failed: ${originalError.message}`)
    this.name = 'ToolExecutionError'
    this.originalError = originalError
    const code = (originalError as Error & { code?: unknown }).code
    if (typeof code === 'string') {
      this.code = code
    }
  }
}
