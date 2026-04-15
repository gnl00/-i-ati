import React, { memo } from 'react'
import { cn } from '@renderer/lib/utils'
import { AssistantMessageHeader, type AssistantMessageHeaderModel } from './AssistantMessageHeader'
import { AssistantMessageBody, type AssistantMessageBodyModel } from './AssistantMessageBody'
import {
  AssistantMessageFooterActions,
  type AssistantMessageFooterActionsModel
} from './AssistantMessageFooterActions'

export interface AssistantMessageShellModel {
  index: number
  isLatest: boolean
  onHover: (hovered: boolean) => void
}

export interface AssistantMessageLayoutProps {
  shell: AssistantMessageShellModel
  header: AssistantMessageHeaderModel
  body: AssistantMessageBodyModel
  footer: AssistantMessageFooterActionsModel
}

export const AssistantMessageLayout: React.FC<AssistantMessageLayoutProps> = memo(({
  shell,
  header,
  body,
  footer
}) => {
  return (
    <div
      id={'assistant-message-' + shell.index}
      onMouseEnter={() => shell.onHover(true)}
      onMouseLeave={() => shell.onHover(false)}
      className={cn(
        'flex justify-start flex-col',
        shell.index === 0 ? 'mt-2' : '',
        shell.isLatest && 'animate-assistant-message-in'
      )}
    >
      <div>
        <AssistantMessageHeader model={header} />
        <AssistantMessageBody model={body} />
      </div>

      <AssistantMessageFooterActions model={footer} />
    </div>
  )
})
