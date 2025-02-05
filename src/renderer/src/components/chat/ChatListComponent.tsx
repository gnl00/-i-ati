import React, { useRef, useMemo, useLayoutEffect, useState } from "react"
import { UserChatItemRef, AssistantChatItemRef } from "./ChatItemComponent"
import { useChatStore } from "@renderer/store"
import { useChatContext } from "@renderer/context/ChatContext"

interface ChatListProps {
    chatWindowHeight?: number
    regenChat: (textCtx: string, mediaCtx: ClipbordImg[] | string[]) => Promise<void>
}

const ChatListComponent = (props: ChatListProps) => {
    const { regenChat } = props
    const [editableContentId, setEditableContentId] = useState(-1)
    const { messages, fetchState } = useChatStore()
    const { chatId } = useChatContext()
    const scrollEndRef = useRef<HTMLDivElement>(null)
    const chatListRefs = useMemo(() => {
        return Array(messages.length).fill(null).map(() => React.createRef<HTMLDivElement>())
    }, [messages])
    useLayoutEffect(() => {
        scrollEndRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
            inline: 'nearest'
        })
    }, [chatId, fetchState, messages.length])
    const onEndClick = (e) => {
        scrollEndRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
            inline: 'nearest'
        })
    }
    return (
        <div className="h-auto space-x-2 w-[100vw] overflow-y-auto" id="chatContainer">
            {
                messages.map((message, index) => {
                    if (!message.body || !message.body.content || message.body.content.length === 0) {
                        return null
                    }
                    return (
                        message.body.role === 'user' ? (
                            <UserChatItemRef
                                className="mr-1"
                                idx={index}
                                key={index}
                                elRef={chatListRefs[index]}
                                message={message}
                                msgSize={messages.length}
                                reGenerate={(textCtx, mediaCtx) => regenChat(textCtx, mediaCtx)}
                            />
                        ) : (
                            <AssistantChatItemRef
                                idx={index}
                                key={index}
                                elRef={chatListRefs[index]}
                                msgSize={messages.length}
                                message={message}
                                editableContentId={editableContentId}
                                setEditableContentId={setEditableContentId}
                            />
                        )
                    )
                })
            }
            {
                chatId && (
                    <div className="absolute bg-black/30 dark:bg-gray-50/30 backdrop-blur-lg text-gray-300 z-10 right-4 bottom-1 rounded-full w-8 h-8 p-1 flex items-center justify-center" onClick={onEndClick}><i className="ri-arrow-down-fill"></i></div>
                )
            }
            <div id="scrollEnd" className="scrollEndRef" ref={scrollEndRef} />
        </div>
    )
}

export default ChatListComponent