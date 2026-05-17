export type CreateUnifiedRequestInput = Omit<IUnifiedRequest, 'messages'> & {
  messages: UnifiedRequestMessage[]
}

export type CreateUnifiedTextRequestInput = Omit<CreateUnifiedRequestInput, 'messages'> & {
  content: UnifiedRequestMessageContent
}

export const createUnifiedRequest = (input: CreateUnifiedRequestInput): IUnifiedRequest => ({
  ...input,
  messages: input.messages
})

export const createUnifiedTextRequest = (input: CreateUnifiedTextRequestInput): IUnifiedRequest => {
  const { content, ...request } = input

  return createUnifiedRequest({
    ...request,
    messages: [{
      role: 'user',
      content
    }]
  })
}
