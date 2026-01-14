import { invokeWebSearchIPC, invokeWebFetchIPC } from '@renderer/invoker/ipcInvoker'
import { useAppConfigStore } from '@renderer/store/appConfig'

/**
 * Web Tools Invokers
 * Note: These functions are called from the renderer process and will invoke IPC
 */

// Web Search Types
interface WebSearchArgs {
  query: string
  fetchCounts?: number
}

interface WebSearchResponse {
  success: boolean
  results: any[]
  error?: string
}

// Web Fetch Types
interface WebFetchArgs {
  url: string
}

interface WebFetchResponse {
  success: boolean
  url: string
  title: string
  content: string
  error?: string
}

/**
 * Web Search Tool Handler
 */
export async function invokeWebSearch(args: WebSearchArgs): Promise<WebSearchResponse> {
  console.log('[WebToolsInvoker] Executing web search with query:', args.query)

  try {
    const { appConfig } = useAppConfigStore.getState()
    const fetchCounts = args.fetchCounts ?? appConfig?.tools?.maxWebSearchItems ?? 3

    const searchResponse: WebSearchResponse = await invokeWebSearchIPC({
      param: args.query,
      fetchCounts: fetchCounts
    })

    // console.log('[WebToolsInvoker] Search response:', searchResponse)
    return searchResponse

  } catch (error: any) {
    console.error('[WebToolsInvoker] Error:', error)
    return {
      success: false,
      results: [],
      error: error.message || 'Unknown error occurred'
    }
  }
}

/**
 * Web Fetch Tool Handler
 */
export async function invokeWebFetch(args: WebFetchArgs): Promise<WebFetchResponse> {
  console.log('[WebToolsInvoker] Fetching URL:', args.url)

  try {
    const fetchResponse: WebFetchResponse = await invokeWebFetchIPC({
      url: args.url
    })

    console.log('[WebToolsInvoker] Fetch response:', fetchResponse)
    return fetchResponse

  } catch (error: any) {
    console.error('[WebToolsInvoker] Error:', error)
    return {
      success: false,
      url: args.url,
      title: '',
      content: '',
      error: error.message || 'Unknown error occurred'
    }
  }
}
