import React, { useRef, useMemo, useLayoutEffect, useState } from "react"
import { UserChatItemRef, AssistantChatItemRef } from "./ChatItemComponent"
import { useChatStore } from "@renderer/store"
import { useChatContext } from "@renderer/context/ChatContext"
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'

interface ChatListProps {
    chatWindowHeight?: number
    regenChat: (textCtx: string, mediaCtx: ClipbordImg[] | string[]) => Promise<void>
}

const ChatListComponent = (props: ChatListProps) => {
    const { chatWindowHeight, regenChat } = props
    const [editableContentId, setEditableContentId] = useState(-1)
    const { messages, fetchState } = useChatStore()
    const { chatId } = useChatContext()
    const virtuoso = useRef(null);
    const chatListRefs = useMemo(() => {
        return Array(messages.length).fill(null).map(() => React.createRef<HTMLDivElement>())
    }, [messages])
    useLayoutEffect(() => {
        virtuoso.current?.scrollToIndex({
            index: messages.length - 1,
            align: 'end',
            behavior: 'auto'
          });
    }, [chatId, fetchState])
    return (
        <Virtuoso 
            style={{ height: chatWindowHeight ? chatWindowHeight - 15 : 880, scrollBehavior: 'smooth'}} 
            totalCount={messages.length}
            data={messages}
            ref={virtuoso}
            itemContent={(index, message) => 
                {return message.body.role === 'user' ? (
                    <UserChatItemRef
                        idx={index}
                        elRef={chatListRefs[index]}
                        message={message}
                        msgSize={messages.length}
                        reGenerate={(textCtx, mediaCtx) => regenChat(textCtx, mediaCtx)}
                    />
                ) : (
                    <AssistantChatItemRef
                        idx={index}
                        elRef={chatListRefs[index]}
                        msgSize={messages.length}
                        message={message}
                        editableContentId={editableContentId}
                        setEditableContentId={setEditableContentId}
                    />
                )}} 
            />
    )
}

export default ChatListComponent