import OpenAI from "openai";
import { ResponseInput } from "openai/resources/responses/responses";

declare type OpenAIMessageType = {
  role: string,
  content: string | ResponseInput | undefined
}

const openAIRequest = async (apiKey: string, baseUrl: string, model: string, context: string, option: any) => {
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
    dangerouslyAllowBrowser: true,
  });
  await client.responses.create({
    model: model,
    input: context,
    stream: (option.stream === undefined) || option.stream,
  });
}

const openAIRequestWithHook = async (req: IChatRequestV2, _signal: AbortSignal | null, beforeFetch: Function, afterFetch: Function) => {
  let memorizedMessage = req.messages.map(msg => {
    const { reasoning, artifacts, name, ...props } = msg
    return props
  })

  if (req.prompt) {
    memorizedMessage = [{ role: 'system', content: req.prompt }, ...memorizedMessage]
  }
  const client = new OpenAI({
    apiKey: req.apiKey,
    baseURL: req.baseUrl,
    dangerouslyAllowBrowser: true,
  });
  beforeFetch()
  try {
    const enableStream = (req.stream === undefined) || req.stream
    const streamResponse = await client.responses.create({
      model: req.model,
      input: memorizedMessage.map(m => {
        return { role: m.role, content: m.content }
      }) as string | ResponseInput | undefined,
      stream: enableStream,
    });
    return streamResponse
  } catch (error: any) {
    throw error
  } finally {
    afterFetch()
  }
}

export {
  openAIRequest,
  openAIRequestWithHook
};
