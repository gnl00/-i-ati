import type { RunEventRepository } from '../repositories/RunEventRepository'

type RunEventServiceDeps = {
  runEventRepository: () => RunEventRepository | undefined
}

export class RunEventService {
  constructor(private readonly deps: RunEventServiceDeps) {}

  saveRunEvent(data: RunEventTrace): number {
    return this.requireRunEventRepository().saveRunEvent(data)
  }

  private requireRunEventRepository(): RunEventRepository {
    const repository = this.deps.runEventRepository()
    if (!repository) throw new Error('Run event repository not initialized')
    return repository
  }
}
