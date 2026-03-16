export const parserLogger = {
  error: (message: string, error?: Error) => {
    if (error) {
      console.error(`[AgentParser] ${message}`, {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
      return
    }

    console.error(`[AgentParser] ${message}`)
  }
}
