import { SKILL_LOAD_ACTION, SKILL_UNLOAD_ACTION } from '@shared/constants/index'
import { useChatStore } from '@renderer/store'

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

function getElectronIPC() {
  const electron = (window as any).electron
  if (!electron?.ipcRenderer) {
    throw new Error('Electron IPC not available')
  }
  return electron.ipcRenderer
}

function withChatUuid<T extends { chat_uuid?: string }>(args: T): T {
  if (args.chat_uuid) return args
  const chatUuid = useChatStore.getState().currentChatUuid
  if (!chatUuid) return args
  return { ...args, chat_uuid: chatUuid }
}

export async function invokeLoadSkill(args: LoadSkillArgs): Promise<LoadSkillResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(SKILL_LOAD_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, message: error.message || 'Unknown error occurred' }
  }
}

export async function invokeUnloadSkill(args: UnloadSkillArgs): Promise<UnloadSkillResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(SKILL_UNLOAD_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, removed: false, message: error.message || 'Unknown error occurred' }
  }
}
