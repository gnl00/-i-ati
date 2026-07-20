import type {
  ToolResultCompactionInput,
  ToolResultCompactionOutput,
  ToolResultCompactor
} from './contracts'

export class ToolResultCompactorRegistry {
  private readonly compactors = new Map<string, ToolResultCompactor>()

  constructor(compactors: ToolResultCompactor[] = []) {
    compactors.forEach(compactor => this.register(compactor))
  }

  register(compactor: ToolResultCompactor): void {
    this.compactors.set(compactor.id, compactor)
  }

  get(compactorId: string): ToolResultCompactor | undefined {
    return this.compactors.get(compactorId)
  }

  compact(
    compactorId: string,
    input: ToolResultCompactionInput
  ): Promise<ToolResultCompactionOutput | undefined> {
    const compactor = this.get(compactorId)
    if (!compactor) {
      return Promise.resolve(undefined)
    }
    return compactor.compact(input)
  }
}
