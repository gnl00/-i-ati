import { BaseAdapter } from '../base'

export class OpenAIImage1Adapter extends BaseAdapter {
  providerType: ProviderType = 'openai'

  buildHeaders(req: IUnifiedRequest): Record<string, string> {
    return {
      'content-type': 'application/json',
      'authorization': `Bearer ${req.apiKey}`
    }
  }

  supportsStreamOptionsUsage(): boolean {
    return false
  }

  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/images/generations`
  }

  buildRequest(req: IUnifiedRequest): any {
    return {
      model: req.model,
      prompt: req.messages.map(m => {
        const { model, ...msg } = m
        return msg
      })[req.messages.length - 1].content,
      size: '1024x1024',
      n: 1
    }
  }

  parseResponse(response: any): IUnifiedResponse {
    const data = response.data
    if (!data) {
      throw new Error('Invalid OpenAI response: no data')
    }

    return {
      id: response.id || 'unknown',
      model: response.model || 'unknown',
      timestamp: response.created ? response.created * 1000 : Date.now(),
      content: response.data,
      finishReason: 'stop',
      raw: response
    }
  }

  parseStreamResponse(chunk: string): IUnifiedStreamResponse | null {
    try {
      if (chunk.startsWith('data: ')) {
        const jsonStr = chunk.slice(6).trim()
        if (jsonStr === '[DONE]') {
          return null
        }

        const data = JSON.parse(jsonStr)
        const choice = data.choices?.[0]
        if (!choice) return null

        const delta = choice.delta
        return {
          id: data.id || 'stream',
          model: data.model || 'unknown',
          delta: {
            content: delta?.content,
            toolCalls: this.transformToolCalls(delta?.tool_calls),
            finishReason: this.mapFinishReason(choice.finish_reason)
          },
          raw: data
        }
      }
    } catch (error) {
      console.warn('Failed to parse OpenAI stream chunk:', error)
    }
    return null
  }
}
