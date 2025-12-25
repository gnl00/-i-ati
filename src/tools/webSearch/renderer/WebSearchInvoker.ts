import { invokeWebSearchIPC } from '@renderer/invoker/ipcInvoker'
import { useAppConfigStore } from '@renderer/store/appConfig'

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
    // Get fetchCounts from appConfig if not provided in args
    const { appConfig } = useAppConfigStore.getState()
    const fetchCounts = args.fetchCounts ?? appConfig?.tools?.maxWebSearchItems ?? 3

    const searchResponse: WebSearchResponse = await invokeWebSearchIPC({
      param: args.query,
      fetchCounts: fetchCounts
    })

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
