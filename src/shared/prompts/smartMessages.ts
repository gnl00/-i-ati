type SmartMessagePromptSummary = {
  chatTitle: string
  summary: string
  compressedAt: number
  chatUpdatedAt: number
}

type SmartMessagePromptParams = {
  summaries: SmartMessagePromptSummary[]
}

export const buildSmartMessagePrompt = ({ summaries }: SmartMessagePromptParams): string => {
  const summaryBlocks = summaries
    .map((item, index) => [
      `## Summary ${index + 1}`,
      `Chat title: ${item.chatTitle || 'Untitled'}`,
      `Chat updated at: ${new Date(item.chatUpdatedAt).toISOString()}`,
      `Compressed at: ${new Date(item.compressedAt).toISOString()}`,
      item.summary.trim()
    ].join('\n'))
    .join('\n\n')

  return [
    'You generate one proactive welcome-page suggestion from recent compressed chat summaries.',
    'The suggestion should help the user continue the most relevant unfinished work.',
    'Call the generate_smart_messages tool exactly once.',
    'The tool argument must be an object with a messages array containing exactly one object with this shape:',
    '{"messages":[{"title":"short label","body":"one sentence suggestion","actionPrompt":"specific prompt to fill into the chat input","reason":"brief source rationale","priorityScore":0.75}]}',
    'Rules:',
    '- title: 2-5 words.',
    '- body: concise and natural, max 150 characters.',
    '- actionPrompt: specific, actionable, max 260 characters.',
    '- priorityScore: number from 0 to 1.',
    '- Use the same primary language as the summaries when clear.',
    '- Do not answer in natural language.',
    '',
    '# Recent summaries',
    summaryBlocks
  ].join('\n')
}
