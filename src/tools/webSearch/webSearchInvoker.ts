/**
 * Web Search Tool Handler
 * 处理 web_search 工具调用
 */

import { WEB_SEARCH_ACTION } from "@constants/index"

export interface WebSearchArgs {
  query: string
}

export interface WebSearchResult {
  success: boolean
  result: string[]
  links: string[]
  error?: string
}

/**
 * Web Search 工具处理器
 */
export async function invokeWebSearch(args: WebSearchArgs): Promise<WebSearchResult> {
  console.log('[WebSearchInvoker] Executing web search with query:', args.query)

  try {
    const searchResults = await window.electron?.ipcRenderer.invoke(WEB_SEARCH_ACTION, {
      fetchCounts: 3,
      param: args.query
    })

    console.log('[WebSearchInvoker] Search results:', searchResults)

    return {
      success: searchResults.success,
      result: searchResults.result || [],
      links: searchResults.links,
      error: searchResults.error
    }
  } catch (error: any) {
    console.error('[WebSearchInvoker] Error:', error)
    return {
      success: false,
      result: [],
      links: [],
      error: error.message || 'Unknown error occurred'
    }
  }
}
