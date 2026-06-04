import { ipcMain, shell } from 'electron'
import path from 'path'
import { createLogger } from '@main/logging/LogService'
import { SkillService } from '@main/services/skills/SkillService'
import { SKILL_FILE } from '@main/services/skills/SkillParser'
import { processImportSkills, processInstallSkill, processLoadSkill, processReadSkillFile, processUnloadSkill } from '@main/tools/skills/SkillToolsProcessor'
import {
  SKILL_LIST_ACTION,
  SKILL_GET_ACTION,
  SKILL_INSTALL_ACTION,
  SKILL_LOAD_ACTION,
  SKILL_UNLOAD_ACTION,
  SKILL_IMPORT_ACTION,
  SKILL_READ_FILE_ACTION,
  SKILL_DELETE_ACTION,
  SKILL_REVEAL_ACTION
} from '@shared/constants'

const logger = createLogger('SkillIPC')

export function registerSkillHandlers(): void {
  ipcMain.handle(SKILL_LIST_ACTION, async () => {
    logger.info('skill.list')
    return await SkillService.listSkills()
  })

  ipcMain.handle(SKILL_GET_ACTION, async (_event, { name }) => {
    logger.info('skill.get', { name })
    return await SkillService.getSkillContent(name)
  })

  ipcMain.handle(SKILL_READ_FILE_ACTION, async (_event, args) => {
    logger.info('skill.read_file')
    return await processReadSkillFile(args)
  })

  ipcMain.handle(SKILL_INSTALL_ACTION, async (_event, args) => {
    logger.info('skill.install')
    return await processInstallSkill(args)
  })

  ipcMain.handle(SKILL_LOAD_ACTION, async (_event, args) => {
    logger.info('skill.load')
    return await processLoadSkill(args)
  })

  ipcMain.handle(SKILL_UNLOAD_ACTION, async (_event, args) => {
    logger.info('skill.unload')
    return await processUnloadSkill(args)
  })

  ipcMain.handle(SKILL_IMPORT_ACTION, async (_event, args) => {
    logger.info('skill.import')
    return await processImportSkills(args)
  })

  ipcMain.handle(SKILL_DELETE_ACTION, async (_event, { name }) => {
    logger.info('skill.delete', { name })
    await SkillService.deleteSkill(name)
  })

  ipcMain.handle(SKILL_REVEAL_ACTION, async (_event, { name }) => {
    logger.info('skill.reveal', { name })
    try {
      const skillRoot = await SkillService.resolveSkillRootPath(name)
      shell.showItemInFolder(path.join(skillRoot, SKILL_FILE))
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
