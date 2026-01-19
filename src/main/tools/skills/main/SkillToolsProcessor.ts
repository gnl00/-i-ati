import { app } from 'electron'
import path from 'path'
import DatabaseService from '@main/services/DatabaseService'
import { SkillService } from '@main/services/skills/SkillService'

interface LoadSkillArgs {
  source: string
  name?: string
  allowOverwrite?: boolean
  activate?: boolean
  chat_uuid?: string
}

interface UnloadSkillArgs {
  name: string
  chat_uuid?: string
}

interface LoadSkillResponse {
  success: boolean
  skill?: SkillMetadata
  content?: string
  activated?: boolean
  message?: string
}

interface UnloadSkillResponse {
  success: boolean
  removed?: boolean
  message?: string
}

const isUrl = (value: string): boolean => /^https?:\/\//i.test(value)

const resolveSourcePath = (source: string, chatUuid?: string): string => {
  if (isUrl(source) || path.isAbsolute(source)) {
    return source
  }

  if (chatUuid) {
    const workspacePath = DatabaseService.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) {
      return path.join(workspacePath, source)
    }
  }

  return path.join(app.getPath('userData'), source)
}

export async function processLoadSkill(args: LoadSkillArgs): Promise<LoadSkillResponse> {
  try {
    const skill = await SkillService.loadSkill({
      source: resolveSourcePath(args.source, args.chat_uuid),
      name: args.name,
      allowOverwrite: args.allowOverwrite
    })

    const content = await SkillService.getSkillContent(skill.name)
    let activated = false
    if (args.activate !== false && args.chat_uuid) {
      const chat = DatabaseService.getChatByUuid(args.chat_uuid)
      if (chat?.id) {
        DatabaseService.addChatSkill(chat.id, skill.name)
        activated = true
      }
    }

    return {
      success: true,
      skill,
      content,
      activated,
      message: activated ? 'Skill loaded and activated.' : 'Skill loaded.'
    }
  } catch (error) {
    console.error('[SkillTools] Failed to load skill:', error)
    return {
      success: false,
      activated: false,
      message: `Failed to load skill: ${error.message}`
    }
  }
}

export async function processUnloadSkill(args: UnloadSkillArgs): Promise<UnloadSkillResponse> {
  try {
    if (!args?.name) {
      return { success: false, removed: false, message: 'name is required' }
    }
    if (!args.chat_uuid) {
      return { success: false, removed: false, message: 'chat_uuid is required' }
    }

    const chat = DatabaseService.getChatByUuid(args.chat_uuid)
    if (!chat?.id) {
      return { success: false, removed: false, message: 'Chat not found' }
    }

    DatabaseService.removeChatSkill(chat.id, args.name)
    return { success: true, removed: true, message: 'Skill removed.' }
  } catch (error) {
    console.error('[SkillTools] Failed to unload skill:', error)
    return {
      success: false,
      removed: false,
      message: `Failed to unload skill: ${error.message}`
    }
  }
}
