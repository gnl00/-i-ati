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
    const [editableContentId, setEditableContentId] = useState(-1)
    const [scrollUp, setScrollUp] = useState(false)
    const { messages, fetchState } = useChatStore()
    const { chatId } = useChatContext()
    const chatListRef = useRef<VListHandle>(null)
    const scrollEndRef = useRef<HTMLDivElement>(null)
    const chatListRefs = useMemo(() => {
        return Array(messages.length).fill(null).map(() => React.createRef<HTMLDivElement>())
    }, [messages])
    useLayoutEffect(() => {
        if (!scrollUp) {
            chatListRef.current?.scrollToIndex(messages.length - 1, {
                align: 'end',
                smooth: true
            })
        }
    }, [messages])
    useEffect(() => {
        setScrollUp(false)
        console.log(chatId, fetchState)
        chatListRef.current?.scrollToIndex(messages.length - 1, {
            align: 'end',
            smooth: true
        })
    }, [chatId, fetchState, messages.length])
    const onEndClick = (e) => {
        chatListRef.current?.scrollToIndex(messages.length - 1, {
            align: 'end',
            smooth: true
        })
    }
    const onWheel = (e) => {
        if (e.deltaY < 0) { // Scrolling up
            setScrollUp(true)
        }
    }
    return (
        <div>
            <VList onWheel={onWheel} ref={chatListRef} className="space-y-2" style={{ height: chatWindowHeight ? chatWindowHeight - 12 : 900, scrollBehavior: 'smooth' }}>
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
            <div onClick={onEndClick} className="fixed bottom-[25%] right-10 bg-black/30 dark:bg-gray-50/30 backdrop-blur-lg text-gray-300 z-10 rounded-full w-8 h-8 p-1 flex items-center justify-center"><i className="ri-arrow-down-fill"></i></div>
        </div>
    )
}

export default ChatListComponent