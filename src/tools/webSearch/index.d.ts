declare interface WebSearchArgs {
    query: string
}

/** @deprecated Use WebSearchResponse instead */
declare interface WebSearchResult {
    success: boolean
    result: string[]
    links: string[]
    error?: string
}

declare interface WebSearchResultV2 {
    query: string
    success: boolean
    link: string
    title: string       // 从网页 <title> 提取
    snippet: string     // 从 Bing 搜索结果提取
    content: string     // 完整抓取内容
    error?: string      // 失败时的错误信息
}

declare interface WebSearchResponse {
    success: boolean        // 整体操作是否成功
    results: WebSearchResultV2[]
    error?: string         // 整体错误（如 Bing 不可达）
}