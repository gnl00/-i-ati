import DatabaseService from './DatabaseService'

export const databaseRuntime = {
  initialize(): Promise<void> {
    return DatabaseService.initialize()
  },

  isReady(): boolean {
    return DatabaseService.isReady()
  },

  close(): void {
    DatabaseService.close()
  }
}
