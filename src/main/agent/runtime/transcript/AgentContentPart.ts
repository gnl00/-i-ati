/**
 * AgentContentPart
 *
 * 放置内容：
 * - runtime 内部用于表达用户输入内容的 typed content parts
 *
 * 业务逻辑边界：
 * - 它服务于 host/bootstrap -> transcript -> request materialization 这条链
 * - 它不是 host attachment metadata 的镜像，而是会进入协议历史的输入事实
 * - 纯文本输入也应规范化成 `input_text` part，而不是退回单一字符串真源
 */
export interface AgentInputTextPart {
  type: 'input_text'
  text: string
}

export interface AgentInputImagePart {
  type: 'input_image'
  fileId?: string
  fileUrl?: string
  imageUrl?: string
  filename?: string
  mimeType?: string
  detail?: 'auto' | 'low' | 'high'
}

export interface AgentInputFilePart {
  type: 'input_file'
  fileId?: string
  fileUrl?: string
  filename?: string
  mimeType?: string
}

export type AgentContentPart =
  | AgentInputTextPart
  | AgentInputImagePart
  | AgentInputFilePart
