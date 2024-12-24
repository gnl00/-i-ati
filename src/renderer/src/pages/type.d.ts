export declare interface LLMMessage {
  role: string;
  content: string;
}

export declare interface VLMImgContent {
  url: string;
  detail: 'auto' | 'low' | 'high';
}

export declare interface VLMMessage {
  type: 'image_url' | 'text'
  text?: string;
  image_url?: VLMImgContent;
}

export declare type ChatContent = LLMMessage | VLMMessage;