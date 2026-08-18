import type { ToolUserQuestionRequest, ToolUserQuestionToolResult } from '@shared/tools/userQuestion'

export type ToolQuestionRequest = ToolUserQuestionRequest

export interface ToolQuestionRequester {
  request(request: ToolQuestionRequest): Promise<ToolUserQuestionToolResult>
}
