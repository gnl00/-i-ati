/**
 * Tools Configuration
 * 合并所有工具定义并导出
 */

import fileOperationsTools from './fileoperations_tools'
import listTools from './list_tools.json'
import toolSearchTools from './registry_search_tools'
import webTools from './web_tools'
import memoryTools from './memory_tools'
import commandTools from './command_tools'
import skillsTools from './skills_tools'
import planTools from './plan_tools'
import scheduleTools from './schedule_tools'
import soulTools from './soul_tools'
import pluginTools from './plugin_tools'
import telegramTools from './telegram_tools'
import activityJournalTools from './activity_journal_tools'
import subagentTools from './subagent_tools'

/**
 * 合并所有工具定义
 */
export const tools = [
  ...listTools,
  ...toolSearchTools,
  ...webTools,
  ...fileOperationsTools,
  ...memoryTools,
  ...commandTools,
  ...skillsTools,
  ...planTools,
  ...scheduleTools,
  ...soulTools,
  ...pluginTools,
  ...telegramTools,
  ...activityJournalTools,
  ...subagentTools
]

/**
 * 导出默认工具配置
 */
export default tools
