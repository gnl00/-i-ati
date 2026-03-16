export class ParserError extends Error {
  constructor(message: string, _context?: unknown) {
    super(message)
    this.name = 'ParserError'
  }
}

export class ChunkParseError extends ParserError {
  constructor(_chunk?: unknown, _error?: Error) {
    super('Failed to parse chunk')
    this.name = 'ChunkParseError'
  }
}
