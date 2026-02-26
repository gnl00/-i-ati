import {
  SKILL_IMPORT_ACTION,
  SKILL_INSTALL_ACTION,
  SKILL_LOAD_ACTION,
  SKILL_READ_FILE_ACTION,
  SKILL_UNLOAD_ACTION
} from '@shared/constants/index'
import { useChatStore } from '@renderer/store'

interface InstallSkillArgs {
  source: string
  name?: string
  allowOverwrite?: boolean
  chat_uuid?: string
}

interface LoadSkillArgs {
  name: string
  chat_uuid?: string
}

interface ImportSkillsArgs {
  folderPath: string
  chat_uuid?: string
}

interface InstallSkillResponse {
  success: boolean
  name?: string
  skill?: SkillMetadata
  message?: string
}

interface LoadSkillResponse {
  success: boolean
  name?: string
  loaded?: boolean
  message?: string
}

interface ImportSkillsResponse {
  success: boolean
  installed?: SkillMetadata[]
  renamed?: Array<{ from: string; to: string }>
  skipped?: Array<{ path: string; reason: string }>
  failed?: Array<{ path: string; error: string }>
  message?: string
}

interface UnloadSkillArgs {
  name: string
  chat_uuid?: string
}

interface ReadSkillFileArgs {
  name: string
  path: string
  encoding?: string
  start_line?: number
  end_line?: number
}

interface UnloadSkillResponse {
  success: boolean
  removed?: boolean
  message?: string
}

interface ReadSkillFileResponse {
  success: boolean
  file_path?: string
  content?: string
  lines?: number
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

export async function invokeInstallSkill(args: InstallSkillArgs): Promise<InstallSkillResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(SKILL_INSTALL_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, message: error.message || 'Unknown error occurred' }
  }
}

export async function invokeLoadSkill(args: LoadSkillArgs): Promise<LoadSkillResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(SKILL_LOAD_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, loaded: false, message: error.message || 'Unknown error occurred' }
  }
}

export async function invokeImportSkills(args: ImportSkillsArgs): Promise<ImportSkillsResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(SKILL_IMPORT_ACTION, withChatUuid(args))
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

export async function invokeReadSkillFile(args: ReadSkillFileArgs): Promise<ReadSkillFileResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(SKILL_READ_FILE_ACTION, args)
  } catch (error: any) {
    return { success: false, message: error.message || 'Unknown error occurred' }
  }
}
