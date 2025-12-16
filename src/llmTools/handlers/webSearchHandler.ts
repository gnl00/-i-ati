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
  error?: string
}

/**
 * Web Search 工具处理器
 */
export async function webSearchHandler(args: WebSearchArgs): Promise<WebSearchResult> {
  console.log('[WebSearchHandler] Executing web search with query:', args.query)

  try {
    const searchResults = await window.electron?.ipcRenderer.invoke(WEB_SEARCH_ACTION, {
      fetchCounts: 3,
      param: args.query
    })

    console.log('[WebSearchHandler] Search results:', searchResults)

    return {
      success: searchResults.success,
      result: searchResults.result || [],
      error: searchResults.error
    }
  } catch (error: any) {
    console.error('[WebSearchHandler] Error:', error)
    return {
      success: false,
      result: [],
      error: error.message || 'Unknown error occurred'
    }
  }
}
