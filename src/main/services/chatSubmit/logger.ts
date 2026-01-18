export const logger = {
  debug: (message: string, data?: any) => console.debug(`[ChatSubmitMain] ${message}`, data || ''),
  info: (message: string, data?: any) => console.log(`[ChatSubmitMain] ${message}`, data || ''),
  warn: (message: string, data?: any) => console.warn(`[ChatSubmitMain] ${message}`, data || ''),
  error: (message: string, error?: Error) => {
    if (error) {
      console.error(`[ChatSubmitMain] ${message}`, {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
      return
    }
    console.error(`[ChatSubmitMain] ${message}`)
  }
}
