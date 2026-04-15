import React, { memo } from 'react'
import {
  AssistantMessageContainer,
  type AssistantMessageProps
} from './AssistantMessageContainer'

export type { AssistantMessageProps } from './AssistantMessageContainer'

export const AssistantMessage: React.FC<AssistantMessageProps> = memo((props) => {
  if (!props.committedMessage || props.committedMessage.role !== 'assistant') {
    return null
  }

  return <AssistantMessageContainer {...props} />
})
