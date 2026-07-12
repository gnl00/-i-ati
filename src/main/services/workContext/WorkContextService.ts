import { chatDb } from '@main/db/chat'

export const WORK_CONTEXT_TEMPLATE = `# Work Context

## Current Goal

## Decisions

## In Progress

## Open Questions

## Temporary Constraints

## Last Updated
`

export interface WorkContextSnapshot {
  content: string
  exists: boolean
  error?: string
}

export const normalizeWorkContextContent = (content: string): string => {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export class WorkContextService {
  getSnapshot(chatUuid: string): WorkContextSnapshot {
    try {
      const record = chatDb.getWorkContextByChatUuid(chatUuid)
      return {
        content: record?.content || WORK_CONTEXT_TEMPLATE,
        exists: Boolean(record)
      }
    } catch (error) {
      return {
        content: WORK_CONTEXT_TEMPLATE,
        exists: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

export const workContextService = new WorkContextService()
