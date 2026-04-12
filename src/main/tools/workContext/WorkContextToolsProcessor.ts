import DatabaseService from '@main/db/DatabaseService'
import type {
  WorkContextGetResponse,
  WorkContextSetResponse
} from '@tools/memory/index.d'

interface WorkContextGetArgs {
  chat_uuid?: string
}

interface WorkContextSetArgs {
  content: string
  chat_uuid?: string
}

const WORK_CONTEXT_TEMPLATE = `# Work Context

## Current Goal

## Decisions

## In Progress

## Open Questions

## Temporary Constraints

## Last Updated
`

const normalizeWorkContextContent = (content: string): string => {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function processWorkContextGet(
  args: WorkContextGetArgs
): Promise<WorkContextGetResponse> {
  try {
    if (!args.chat_uuid) {
      return {
        success: false,
        content: WORK_CONTEXT_TEMPLATE,
        exists: false,
        message: 'chat_uuid is required. Returned work context template content.'
      }
    }

    const record = DatabaseService.getWorkContextByChatUuid(args.chat_uuid)
    const exists = Boolean(record)
    const content = record?.content || WORK_CONTEXT_TEMPLATE

    return {
      success: true,
      chat_uuid: args.chat_uuid,
      content,
      exists,
      message: exists ? 'Work context loaded.' : 'Work context not found. Returned template.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      content: WORK_CONTEXT_TEMPLATE,
      exists: false,
      message: `Failed to get work context: ${message}`
    }
  }
}

export async function processWorkContextSet(
  args: WorkContextSetArgs
): Promise<WorkContextSetResponse> {
  try {
    if (!args.chat_uuid) {
      return {
        success: false,
        updated: false,
        skipped: false,
        message: 'chat_uuid is required. Nothing written.'
      }
    }
    if (!Object.prototype.hasOwnProperty.call(args, 'content')) {
      return {
        success: false,
        updated: false,
        skipped: false,
        message: 'missing required param: content'
      }
    }
    if (typeof args.content !== 'string') {
      return {
        success: false,
        updated: false,
        skipped: false,
        message: 'invalid param type: content (expected string)'
      }
    }

    const chat = DatabaseService.getChatByUuid(args.chat_uuid)
    if (!chat?.id) {
      return {
        success: false,
        updated: false,
        skipped: false,
        message: 'chat_uuid not found. Nothing written.'
      }
    }

    const previous = DatabaseService.getWorkContextByChatUuid(args.chat_uuid)
    const previousNormalized = normalizeWorkContextContent(previous?.content || '')
    const normalizedInput = normalizeWorkContextContent(args.content)
    const nextNormalized = normalizedInput || normalizeWorkContextContent(WORK_CONTEXT_TEMPLATE)

    if (previousNormalized === nextNormalized) {
      return {
        success: true,
        chat_uuid: args.chat_uuid,
        updated: false,
        skipped: true,
        message: 'Work context unchanged. Skipped write.'
      }
    }

    const contentToWrite = `${nextNormalized.replace(/\r\n/g, '\n').trimEnd()}\n`
    DatabaseService.upsertWorkContext(chat.id, args.chat_uuid, contentToWrite)

    return {
      success: true,
      chat_uuid: args.chat_uuid,
      updated: true,
      skipped: false,
      message: 'Work context updated.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      updated: false,
      skipped: false,
      message: `Failed to set work context: ${message}`
    }
  }
}
