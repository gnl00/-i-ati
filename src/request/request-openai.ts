import OpenAI from "openai";
import { ResponseInput } from "openai/resources/responses/responses";
// const c = new OpenAI();
// const response = await c.responses.create({
//   model: "gpt-4.1",
//   input: "Write a one-sentence bedtime story about a unicorn."
// });

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

const openAIRequestWithHook = async (req: IChatRequestV2, signal: AbortSignal | null, beforeFetch: Function, afterFetch: Function) => {
  let memorizedMessage = req.messages.map(msg => {
    const { reasoning, artifatcs, name, ...props } = msg
    return props
  })

  if (req.prompt) {
    memorizedMessage = [{role: 'system',content: req.prompt}, ...memorizedMessage]
  }
  const client = new OpenAI({
    apiKey: req.apiKey,
    baseURL: 'https://api2.aigcbest.top/v1',
    dangerouslyAllowBrowser: true,
  });
  beforeFetch()
  try {
    const enableStream = (req.stream === undefined) || req.stream
    const streamResponse = await client.responses.create({
      model: req.model,
      input: memorizedMessage.map(m => {
        return {role: m.role, content: m.content}
      }) as string | ResponseInput | undefined,
      stream: enableStream
    });
    
    // if (enableStream && Symbol.asyncIterator in streamResponse) {
    //   for await (const event of streamResponse) {
    //     console.log(event);
    //   }
    // } else {
    //   console.log(streamResponse);
    // }
    return streamResponse
  } catch (error: any) {
    
  } finally {
    afterFetch()
  }
}

export {
  openAIRequest,
  openAIRequestWithHook
}