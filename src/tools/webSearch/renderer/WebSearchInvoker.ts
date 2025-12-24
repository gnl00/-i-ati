import { WEB_SEARCH_ACTION } from '@constants/index'

/**
 * Web Search Tool Handler
 * Note: This function is called from the renderer process and will invoke IPC
 */

interface WebSearchArgs {
  query: string
  fetchCounts?: number
}

interface WebSearchResponse {
  success: boolean
  results: any[]
  error?: string
}

export async function invokeWebSearch(args: WebSearchArgs): Promise<WebSearchResponse> {
  console.log('[WebSearchInvoker] Executing web search with query:', args.query)

  try {
    const fetchCounts = args.fetchCounts ?? 3

    // This code runs in renderer process, window.electron is available
    const electron = (window as any).electron
    if (!electron || !electron.ipcRenderer) {
      throw new Error('Electron IPC not available')
    }

    const searchResponse: WebSearchResponse = await electron.ipcRenderer.invoke(
      WEB_SEARCH_ACTION,
      {
        param: args.query,
        fetchCounts: fetchCounts
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
