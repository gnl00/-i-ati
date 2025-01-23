import { VList, VListHandle } from "virtua"
import React, { useEffect, useRef, useMemo, useLayoutEffect, useState } from "react"
import { UserChatItemRef, AssistantChatItemRef } from "./ChatItemComponent"
import { debounce } from 'lodash'
import AnimateHeight, { Height } from 'react-animate-height'
import { Transition } from 'react-transition-group'
import { useChatStore } from "@renderer/store"
import { Link, Button, Element, Events, animateScroll as scroll, scrollSpy, scroller } from 'react-scroll'
import { useChatContext } from "@renderer/context/ChatContext"

interface ChatListProps {
    chatWindowHeight?: number
    regenChat: (textCtx: string, mediaCtx: ClipbordImg[] | string[]) => Promise<void>
}

const ChatListComponent = (props: ChatListProps) => {
    const { chatWindowHeight, regenChat } = props
    const [localFetchState, setLocalFetchState] = useState<boolean>()
    const [editableContentId, setEditableContentId] = useState(-1)
    const { messages, fetchState } = useChatStore()
    const { chatId } = useChatContext()
    const chatListRef = useRef<VListHandle>(null)
    const scrollEndRef = useRef<HTMLDivElement>(null)
    const chatListRefs = useMemo(() => {
        return Array(messages.length).fill(null).map(() => React.createRef<HTMLDivElement>())
    }, [messages])
    useEffect(() => {
        chatListRef.current?.scrollToIndex(messages.length, {
            align: 'end',
            smooth: true
        })
    }, [chatId])
    // useEffect(() => {
    //     if(fetchState != localFetchState) {
    //         chatListRef.current?.scrollToIndex(messages.length, {
    //             align: 'end',
    //             smooth: true
    //         })
    //     }
    //     setLocalFetchState(fetchState)
    // }, [fetchState])
    return (
        // <div className="h-full space-x-2 w-[100vw] overflow-y-auto" id="chatContainer">
        //     {
        //         messages.map((message, index) => {
        //             if (!message.body || !message.body.content || message.body.content.length === 0) {
        //                 return null
        //             }
        //             const elementName = `message-${index}`
        //             return (
        //                 <Element name={elementName} key={index} className="scroll-smooth">
        //                     {message.body.role === 'user' ? (
        //                         <UserChatItemRef
        //                             idx={index}
        //                             elRef={chatListRefs[index]}
        //                             message={message}
        //                             msgSize={messages.length}
        //                             reGenerate={(textCtx, mediaCtx) => regenChat(textCtx, mediaCtx)}
        //                         />
        //                     ) : (
        //                         <AssistantChatItemRef
        //                             idx={index}
        //                             elRef={chatListRefs[index]}
        //                             msgSize={messages.length}
        //                             message={message}
        //                             editableContentId={editableContentId}
        //                             setEditableContentId={setEditableContentId}
        //                         />
        //                     )}
        //                 </Element>
        //             )
        //         })
        //     }
        //     <div id="scrollEnd" className="scrollEndRef" ref={scrollEndRef} />
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