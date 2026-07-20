export interface VisionAnalyzeImageInput {
  ref?: string
  url?: string
  raw_data?: string
}

export interface VisionAnalyzeArgs {
  images?: VisionAnalyzeImageInput[]
  image_refs?: string[]
  urls?: string[]
  raw_data?: string[]
  prompt: string
  chat_uuid?: string
  timeout_seconds?: number
}

export interface VisionImageSource {
  type: 'ref' | 'url' | 'raw_data'
  ref?: string
  url?: string
}

export interface VisionAnalyzeResponse {
  success: boolean
  result?: string
  image_count: number
  images: VisionImageSource[]
  message: string
}
