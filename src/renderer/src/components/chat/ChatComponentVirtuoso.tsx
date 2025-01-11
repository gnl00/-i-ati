import { VList, VListHandle } from "virtua"
import React, { useEffect, useRef, Ref, RefObject, useMemo, useLayoutEffect } from "react"
import { UserChatItem, UserChatItemRef, AssistantChatItem, AssistantChatItemRef } from "./ChatItemComponent"
import { debounce } from 'lodash'
import { Virtuoso } from 'react-virtuoso'


interface ChatComponentProps {
    messages: MessageEntity[]
    lastMsgStatus: boolean
    reGenerate: Function
    toast: Function
    editableContentId: number
    setEditableContentId: Function
    chatWindowHeight?: number
}

interface Message {
    key: string
    text: string
    user: 'me' | 'other'
}

let idCounter = 0

function randomMessage(user: Message['user']): Message {
    return { user, key: `${idCounter++}`, text: randTextRange({ min: user === 'me' ? 20 : 100, max: 200 }) }
  }

export const ChatComponent = (props: ChatComponentProps) => {
    const { messages, lastMsgStatus, reGenerate, toast, editableContentId, setEditableContentId, chatWindowHeight } = props
    const chatListRef = useRef<VListHandle>(null)
    const scrollEndRef = useRef<HTMLDivElement>(null)
    const chatListRefs = useMemo(() => {
        return Array(messages.length).fill(null).map(() => React.createRef<HTMLDivElement>())
    }, [messages.length])
    useEffect(() => {
        const debouncedScrollToIndex = debounce(() => {
            chatListRef.current?.scrollToIndex(messages.length, {
                align: 'end',
                smooth: true
            })
        }, 0)
        debouncedScrollToIndex()
        return () => {
            debouncedScrollToIndex.cancel();
        }
    }, [messages.length])
    return <Virtuoso style={{ height: chatWindowHeight ? chatWindowHeight - 18 : 900 }} totalCount={200} itemContent={index => <div>Item {index}</div>} />
    // return (
    //     <VList ref={chatListRef} className="scroll-smooth space-y-2" style={{ height: chatWindowHeight ? chatWindowHeight - 12 : 900}}>
    //         {
    //             messages.map((message, index) => {
    //                 if (!message.body || !message.body.content || message.body.content.length === 0) {
    //                     return
    //                 }
    //                 return message.body.role == 'user' ?
    //                 <UserChatItemRef
    //                     key={index} 
    //                     itemRef={chatListRefs[index]}
    //                     idx={index}
    //                     message={message}
    //                     msgSize={messages.length}
    //                     lastMsgStatus={lastMsgStatus}
    //                     reGenerate={reGenerate}
    //                     toast={toast}
    //                     />
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
    //             })
    //         }
    //         <div ref={scrollEndRef} className="scrollEndRef"></div>
    //     </VList>
    // )
}

