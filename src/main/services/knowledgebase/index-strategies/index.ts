import type { KnowledgebaseIndexableFile } from '../types'
import { DefaultIndexStrategy } from './DefaultIndexStrategy'
import { HTMLIndexStrategy } from './HTMLIndexStrategy'
import { MDIndexStrategy } from './MDIndexStrategy'
import type { IndexStrategy } from './types'

const registeredStrategies: IndexStrategy[] = [
  new HTMLIndexStrategy(),
  new MDIndexStrategy()
]

const defaultIndexStrategy = new DefaultIndexStrategy()

export function resolveIndexStrategy(file: KnowledgebaseIndexableFile): IndexStrategy {
  return registeredStrategies.find(strategy => strategy.supports(file)) ?? defaultIndexStrategy
}

export {
  DefaultIndexStrategy,
  HTMLIndexStrategy,
  MDIndexStrategy
}

export type {
  IndexStrategy,
  IndexStrategyInput,
  PreparedKnowledgebaseDocument
} from './types'
