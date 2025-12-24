import { WEB_SEARCH_ACTION } from "@constants/index"

/**
 * Web Search 工具处理器
 */
export async function invokeWebSearch(args: WebSearchArgs): Promise<WebSearchResponse> {
  console.log('[WebSearchInvoker] Executing web search with query:', args.query)

  try {
    const searchResponse: WebSearchResponse = await window.electron?.ipcRenderer.invoke(
      WEB_SEARCH_ACTION,
      {
        param: args.query
      }
    )

    console.log('[WebSearchInvoker] Search response:', searchResponse)

    return searchResponse

  } catch (error: any) {
    console.error('[WebSearchInvoker] Error:', error)
    return {
      success: false,
      results: [],
      error: error.message || 'Unknown error occurred'
    }
  }
}
