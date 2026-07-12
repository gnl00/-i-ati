import DatabaseService from './DatabaseService'

export const assistantDb = {
  saveAssistant: (assistant: Assistant): string => DatabaseService.saveAssistant(assistant),
  getAllAssistants: (): Assistant[] => DatabaseService.getAllAssistants(),
  deleteAllAssistants: (): void => DatabaseService.deleteAllAssistants(),
  getAssistantById: (id: string): Assistant | undefined => DatabaseService.getAssistantById(id),
  updateAssistant: (assistant: Assistant): void => DatabaseService.updateAssistant(assistant),
  deleteAssistant: (id: string): void => DatabaseService.deleteAssistant(id)
}
