export interface VisionAgentAnalyzeImageInput {
  ref?: string
  url?: string
  raw_data?: string
}

export interface VisionAgentAnalyzeArgs {
  images?: VisionAgentAnalyzeImageInput[]
  image_refs?: string[]
  urls?: string[]
  raw_data?: string[]
  prompt: string
  chat_uuid?: string
  timeout_seconds?: number
}

export interface VisionAgentImageSource {
  type: 'ref' | 'url' | 'raw_data'
  ref?: string
  url?: string
}

export interface VisionAgentAnalyzeResponse {
  success: boolean
  result?: string
  image_count: number
  images: VisionAgentImageSource[]
  message: string
}
