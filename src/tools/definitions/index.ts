/**
 * Tools Configuration
 * 合并所有工具定义并导出
 */

import fileOperationsTools from './fileoperations_tools'
import listTools from './list_tools.json'
import toolSearchTools from './registry_search_tools'
import webSearchTools from './web_search_tools'

/**
 * 合并所有工具定义
 */
export const tools = [
  ...listTools,
  ...toolSearchTools,
  ...webSearchTools,
  ...fileOperationsTools
]

/**
 * 导出默认工具配置
 */
export default tools
