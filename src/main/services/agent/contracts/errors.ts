export class AbortError extends Error {
  constructor(message: string = 'Request aborted') {
    super(message)
    this.name = 'AbortError'
  }
}

export class ToolExecutionError extends Error {
  constructor(toolName: string, originalError: Error) {
    super(`Tool "${toolName}" execution failed: ${originalError.message}`)
    this.name = 'ToolExecutionError'
  }
}
