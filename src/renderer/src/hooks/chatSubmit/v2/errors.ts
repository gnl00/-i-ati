export class AbortError extends Error {
  constructor(message: string = 'Request aborted') {
    super(message)
    this.name = 'AbortError'
  }
}
