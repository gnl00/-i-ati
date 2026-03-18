type CompressionPromptParams = {
  conversationText: string
  previousSummary?: string
}

export const buildCompressionPrompt = (params: CompressionPromptParams): string => {
  const { conversationText, previousSummary } = params

  if (previousSummary) {
    return `你需要将之前的对话摘要与新的对话内容合并，生成一个新的综合摘要。

之前的摘要：
${previousSummary}

新的对话内容：
${conversationText}

要求：
1. 将之前的摘要与新对话内容整合为一个连贯的摘要
2. 保留重要的事实、决策和结论
3. 保持时间顺序
4. 使用第三人称描述
5. 避免重复，突出新增的关键信息
6. 输出分两部分，严格按如下格式：

Summary:
<一段不超过 500 字的摘要>

Key facts:
- <关键事实 1（不超过 80 字）>
- <关键事实 2（不超过 80 字）>
- <关键事实 3（不超过 80 字）>
- ...（总计 5-10 条）`
  }

  return `请将以下对话压缩为简洁的摘要，保留关键信息和上下文：

${conversationText}

要求：
1. 保留重要的事实、决策和结论
2. 保持时间顺序
3. 使用第三人称描述
4. 重点关注用户的需求和助手的回答要点
5. 输出分两部分，严格按如下格式：

Summary:
<一段不超过 500 字的摘要>

Key facts:
- <关键事实 1（不超过 80 字）>
- <关键事实 2（不超过 80 字）>
- <关键事实 3（不超过 80 字）>
- ...（总计 5-10 条）`
}
