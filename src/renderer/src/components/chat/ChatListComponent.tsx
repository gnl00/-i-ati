import { VList, VListHandle } from "virtua"
import React, { useEffect, useRef, useMemo, useLayoutEffect, useState } from "react"
import { UserChatItemRef, AssistantChatItemRef } from "./ChatItemComponent"
import { debounce } from 'lodash'
import AnimateHeight, { Height } from 'react-animate-height'
import { Transition } from 'react-transition-group'
import { useChatStore } from "@renderer/store"

interface ChatListProps {
    chatWindowHeight?: number
    regenChat: (textCtx: string, mediaCtx: ClipbordImg[] | string[]) => Promise<void>
}

const ChatListComponent = (props: ChatListProps) => {
    const { chatWindowHeight, regenChat } = props
    const [editableContentId, setEditableContentId] = useState(-1)
    const { messages } = useChatStore()
    const chatListRef = useRef<VListHandle>(null)
    const scrollEndRef = useRef<HTMLDivElement>(null)
    const chatListRefs = useMemo(() => {
        return Array(messages.length).fill(null).map(() => React.createRef<HTMLDivElement>())
    }, [messages.length])
    useLayoutEffect(() => { }, [messages.length])
    useEffect(() => {
        const debouncedScrollToIndex = debounce(() => {
            chatListRef.current?.scrollToIndex(messages.length - 1, {
                align: 'end',
                smooth: true
            })
        }, 10)
        debouncedScrollToIndex()
        return () => {
            debouncedScrollToIndex.cancel();
        }
    }, [messages.length])
    return (
        // <div className="h-full space-x-2 scroll-smooth w-[100vw]">
        //     {
        //         messages.map((message, index) => {
        //             if (!message.body || !message.body.content || message.body.content.length === 0) {
        //                 return
        //             }
        //             return message.body.role == 'user' ?
        //                 <UserChatItemRef
        //                     key={index}
        //                     itemRef={chatListRefs[index]}
        //                     idx={index}
        //                     message={message}
        //                     msgSize={messages.length}
        //                     lastMsgStatus={lastMsgStatus}
        //                     reGenerate={reGenerate}
        //                     toast={toast}
        //                 />
        //                 :
        //                 <AssistantChatItemRef
        //                     key={index}
        //                     itemRef={chatListRefs[index]}
        //                     idx={index}
        //                     msgSize={messages.length}
        //                     message={message}
        //                     editableContentId={editableContentId}
        //                     setEditableContentId={setEditableContentId}
        //                     toast={toast}
        //                 />
        //         })
        //     }
        //     <div ref={scrollEndRef} className="scrollEndRef"></div>
        // </div>
        <VList ref={chatListRef} className="space-y-2" style={{ height: chatWindowHeight ? chatWindowHeight - 12 : 900, scrollBehavior: 'smooth' }}>
            {
                messages.map((message, index) => {
                    if (!message.body || !message.body.content || message.body.content.length === 0) {
                        return
                    }
                    return message.body.role == 'user' ?
                        <UserChatItemRef
                            key={index}
                            idx={index}
                            elRef={chatListRefs[index]}
                            message={message}
                            msgSize={messages.length}
                            reGenerate={(textCtx, mediaCtx) => regenChat(textCtx, mediaCtx)}
                        />
                        :
                        <AssistantChatItemRef
                            key={index}
                            idx={index}
                            elRef={chatListRefs[index]}
                            msgSize={messages.length}
                            message={message}
                            editableContentId={editableContentId}
                            setEditableContentId={setEditableContentId}
                        />
                })
            }
            <div ref={scrollEndRef} className="scrollEndRef"></div>
        </VList>
    )
}

export default ChatListComponent