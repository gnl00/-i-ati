export class AbortError extends Error {
  constructor(message: string = 'Request aborted') {
    super(message)
    this.name = 'AbortError'
  }
}

export class DuplicateSubmissionIdError extends Error {
  code = 'DUPLICATE_SUBMISSION_ID'

  constructor(submissionId: string) {
    super(`DUPLICATE_SUBMISSION_ID: ${submissionId}`)
    this.name = 'DuplicateSubmissionIdError'
  }
}

export class ParserError extends Error {
  constructor(message: string, _context?: any) {
    super(message)
    this.name = 'ParserError'
  }
}

export class ChunkParseError extends ParserError {
  constructor(_chunk?: any, _error?: Error) {
    super('Failed to parse chunk')
    this.name = 'ChunkParseError'
  }
}

export class ToolExecutionError extends Error {
  constructor(toolName: string, originalError: Error) {
    super(`Tool "${toolName}" execution failed: ${originalError.message}`)
    this.name = 'ToolExecutionError'
  }
}
