import DatabaseService from './DatabaseService'

export const runEventDb = {
  saveRunEvent: (data: RunEventTrace): number => DatabaseService.saveRunEvent(data)
}
