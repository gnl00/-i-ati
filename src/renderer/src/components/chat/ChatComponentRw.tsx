import { VList, VListHandle } from "virtua"
import { VariableSizeList as List } from 'react-window';
import React, { useEffect, useRef, Ref, RefObject, useMemo, useLayoutEffect } from "react"
import { UserChatItem, UserChatItemRef, AssistantChatItem, AssistantChatItemRef } from "./ChatItemComponent"
import { debounce } from 'lodash'

interface ChatComponentProps {
    messages: MessageEntity[]
    lastMsgStatus: boolean
    reGenerate: Function
    toast: Function
    editableContentId: number
    setEditableContentId: Function
    chatWindowHeight?: number
}

export const ChatComponent = (props: ChatComponentProps) => {
    const { messages, lastMsgStatus, reGenerate, toast, editableContentId, setEditableContentId, chatWindowHeight } = props
    const chatListRef = useRef<VListHandle>(null)
    const scrollEndRef = useRef<HTMLDivElement>(null)
    const chatListRefs = useMemo(() => {
        return Array(messages.length).fill(null).map(() => React.createRef<HTMLDivElement>())
    }, [messages.length])
    useLayoutEffect(() => {
        // const els = document.getElementsByClassName('scrollEndRef')
        // console.log(els.length);
        // console.log('scrolling');
        // console.log(scrollEndRef.current);
        // if (scrollEndRef.current) {
        //     scrollEndRef.current.scrollIntoView({
        //         behavior: 'auto'
        //     })
        // }
        // chatListRef.current?.scrollToIndex(messages.length - 1, {
        //     align: 'end',
        //     smooth: true
        // })
    }, [messages])
    useEffect(() => {
        // chatListRef.current?.scrollToIndex(messages.length - 1, {
        //     align: 'end',
        //     smooth: true
        // })
        // const debouncedScrollToIndex = debounce(() => {
        //     chatListRef.current?.scrollToIndex(messages.length - 1, {
        //         align: 'end',
        //         smooth: true
        //     })
        // }, 50)
        // debouncedScrollToIndex()
        // return () => {
        //     debouncedScrollToIndex.cancel();
        // }
    }, [messages])
    return (
        <VList ref={chatListRef} className="scroll-smooth space-y-2" style={{ height: chatWindowHeight ? chatWindowHeight - 12 : 900}}>
            {
                messages.map((message, index) => {
                    if (!message.body || !message.body.content || message.body.content.length === 0) {
                        return
                    }
                    return message.body.role == 'user' ?
                    <UserChatItemRef
                        key={index} 
                        itemRef={chatListRefs[index]}
                        idx={index}
                        message={message}
                        msgSize={messages.length}
                        lastMsgStatus={lastMsgStatus}
                        reGenerate={reGenerate}
                        toast={toast}
                        />
                    :
                    <AssistantChatItemRef
                        key={index} 
                        itemRef={chatListRefs[index]}
                        idx={index}
                        msgSize={messages.length}
                        message={message}
                        editableContentId={editableContentId}
                        setEditableContentId={setEditableContentId}
                        toast={toast}
                    />
                })
            }
            <div ref={scrollEndRef} className="scrollEndRef"></div>
        </VList>
    )
}

