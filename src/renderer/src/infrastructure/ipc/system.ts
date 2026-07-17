import {
  CHECK_IS_DIRECTORY,
  DB_EMOTION_STATE_GET,
  EMOTION_PACKS_GET,
  FILE_CREATE_DIR_ACTION,
  OPEN_EXTERNAL,
  OPEN_PATH,
  PIN_WINDOW,
  SELECT_DIRECTORY,
  WIN_CLOSE,
  WIN_MAXIMIZE,
  WIN_MINIMIZE
} from '@shared/constants/index'
import { invokeIpc } from './client'

export const invokePinWindow = (pinState: boolean): Promise<void> => invokeIpc(PIN_WINDOW, pinState)
export const invokeWindowClose = (): Promise<void> => invokeIpc(WIN_CLOSE)
export const invokeWindowMinimize = (): Promise<void> => invokeIpc(WIN_MINIMIZE)
export const invokeWindowMaximize = (): Promise<void> => invokeIpc(WIN_MAXIMIZE)
export const invokeOpenExternal = (url: string): Promise<void> => invokeIpc(OPEN_EXTERNAL, url)
export const invokeOpenPath = (targetPath: string): Promise<{ success: boolean; error?: string; path?: string }> =>
  invokeIpc(OPEN_PATH, targetPath)
export const invokeEmotionPacksGet = (): Promise<Array<{ name: string; source: 'builtin' | 'user' }>> =>
  invokeIpc(EMOTION_PACKS_GET)
export const invokeDbEmotionStateGet = (): Promise<EmotionStateSnapshot | undefined> =>
  invokeIpc(DB_EMOTION_STATE_GET)
export const invokeCreateDirectory = (args: { directory_path: string; recursive?: boolean }): Promise<{ success: boolean; error?: string }> =>
  invokeIpc(FILE_CREATE_DIR_ACTION, args)
export const invokeSelectDirectory = (): Promise<{ success: boolean; path: string | null }> =>
  invokeIpc(SELECT_DIRECTORY)
export const invokeCheckIsDirectory = (path: string): Promise<{ success: boolean; isDirectory: boolean; error?: string }> =>
  invokeIpc(CHECK_IS_DIRECTORY, path)
