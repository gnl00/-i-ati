export declare type ClipbordImg = string | ArrayBuffer | null;

export declare interface LLMMessage {
  role: string;
  content: string;
}

export declare interface VLMImgContent {
  url: string;
  detail: 'auto' | 'low' | 'high';
}

interface VLMContent {
  type: 'image_url' | 'text'
  text?: string;
  image_url?: VLMImgContent;
}

export declare interface VLMMessage {
  role: string;
  content: VLMContent[]
}

export declare type ChatMessage = LLMMessage | VLMMessage;