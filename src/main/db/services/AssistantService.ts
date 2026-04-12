import type { AssistantRepository } from '../repositories/AssistantRepository'

type AssistantServiceDeps = {
  assistantRepository: () => AssistantRepository | undefined
}

export class AssistantService {
  constructor(private readonly deps: AssistantServiceDeps) {}

  saveAssistant(assistant: Assistant): string {
    return this.requireAssistantRepository().saveAssistant(assistant)
  }

  getAllAssistants(): Assistant[] {
    return this.requireAssistantRepository().getAllAssistants()
  }

  deleteAllAssistants(): void {
    this.requireAssistantRepository().deleteAllAssistants()
  }

  getAssistantById(id: string): Assistant | undefined {
    return this.requireAssistantRepository().getAssistantById(id)
  }

  updateAssistant(assistant: Assistant): void {
    this.requireAssistantRepository().updateAssistant(assistant)
  }

  deleteAssistant(id: string): void {
    this.requireAssistantRepository().deleteAssistant(id)
  }

  private requireAssistantRepository(): AssistantRepository {
    const repository = this.deps.assistantRepository()
    if (!repository) throw new Error('Assistant repository not initialized')
    return repository
  }
}
