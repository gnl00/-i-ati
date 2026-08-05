import { chatDb } from '@main/db/chat'
import {
  normalizeWorkContextContent,
  WORK_CONTEXT_TEMPLATE,
  workContextService
} from '@main/services/workContext/WorkContextService'
import type {
  SessionContextResponse,
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

const SESSION_CONTEXT_ACTIONS = ['get', 'set'] as const
type SessionContextAction = (typeof SESSION_CONTEXT_ACTIONS)[number]

export async function processSessionContext(
  args: unknown = {}
): Promise<SessionContextResponse> {
  const normalizedArgs = args && typeof args === 'object' && !Array.isArray(args)
    ? args as Partial<Record<'action' | 'content', unknown>>
    : {}
  const action = typeof normalizedArgs.action === 'string' ? normalizedArgs.action.trim() : ''
  if (!action) {
    return { success: false, message: 'Missing required parameter: action' }
  }
  if (!SESSION_CONTEXT_ACTIONS.includes(action as SessionContextAction)) {
    return {
      success: false,
      message: `Invalid action: ${action}. Expected one of: ${SESSION_CONTEXT_ACTIONS.join(', ')}`
    }
  }

  switch (action as SessionContextAction) {
    case 'get':
      return processWorkContextGet(normalizedArgs as WorkContextGetArgs)
    case 'set':
      return processWorkContextSet(normalizedArgs as WorkContextSetArgs)
  }
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

    const snapshot = workContextService.getSnapshot(args.chat_uuid)

    if (snapshot.error) {
      return {
        success: false,
        content: snapshot.content,
        exists: false,
        message: `Failed to get work context: ${snapshot.error}`
      }
    }

    return {
      success: true,
      chat_uuid: args.chat_uuid,
      content: snapshot.content,
      exists: snapshot.exists,
      message: snapshot.exists ? 'Work context loaded.' : 'Work context not found. Returned template.'
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

    const chat = chatDb.getChatByUuid(args.chat_uuid)
    if (!chat?.id) {
      return {
        success: false,
        updated: false,
        skipped: false,
        message: 'chat_uuid not found. Nothing written.'
      }
    }

    const previous = chatDb.getWorkContextByChatUuid(args.chat_uuid)
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
    chatDb.upsertWorkContext(chat.id, args.chat_uuid, contentToWrite)

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
