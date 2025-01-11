import { VList, VListHandle } from "virtua"
import React, { useEffect, useRef, Ref, RefObject, useMemo, useLayoutEffect, useState } from "react"
import { UserChatItem, UserChatItemRef, AssistantChatItem, AssistantChatItemRef } from "./ChatItemComponent"
import { debounce } from 'lodash'
import ReactMarkdown from 'react-markdown'
import { Button } from "../ui/button"
import { cn } from "@renderer/lib/utils"
import AnimateHeight from 'react-animate-height'

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
    useLayoutEffect(() => { }, [messages.length])
    useEffect(() => {
        // const debouncedScrollToIndex = debounce(() => {
        //     chatListRef.current?.scrollToIndex(messages.length, {
        //         align: 'start',
        //         smooth: true
        //     })
        // }, 0)
        // debouncedScrollToIndex()
        // return () => {
        //     debouncedScrollToIndex.cancel();
        // }
        scrollEndRef.current?.scrollIntoView({
            behavior: 'smooth'
        })
    }, [messages])
    const [on, setOn] = useState(false);
    const [output, setOutput] = useState('');

    useEffect(() => {

    }, []);

    const onClick = () => {
        setOn(!on)
        const interval = setInterval(() => {
            setOutput(prevOutput => prevOutput + ' ' + Math.random().toString(36).substring(7));
        }, 500); // 每100毫秒输出一次

        const timeout = setTimeout(() => {
            clearInterval(interval); // 3秒后清除定时器
        }, 5000); // 3秒后停止输出

        return () => {
            clearInterval(interval); // 组件卸载时清除定时器
            clearTimeout(timeout); // 清除超时定时器
        };
    }

    return (
        // <div className="space-y-2 w-auto bg-red-500">
        //     <Button onClick={onClick}>Btn</Button>
        //     <AnimateHeight
        //         duration={500}
        //         height={on ? 'auto' : 10}
        //     >
        //         <div className="h-full w-full">
        //             <ReactMarkdown
        //                 className={cn(
        //                     'prose p-2 w-auto text-md font-medium bg-gray-400'
        //                 )}
        //                 >
        //                 {
        //                     output
        //                 }
        //             </ReactMarkdown>
        //         </div>
        //     </AnimateHeight>
        // </div>

        // <div className="h-full space-x-2 scroll-smooth">
        //     {
        //         messages.map((message, index) => {
        //             if (!message.body || !message.body.content || message.body.content.length === 0) {
        //                 return
        //             }
        //             return message.body.role == 'user' ?
        //             <UserChatItemRef
        //                 key={index} 
        //                 itemRef={chatListRefs[index]}
        //                 idx={index}
        //                 message={message}
        //                 msgSize={messages.length}
        //                 lastMsgStatus={lastMsgStatus}
        //                 reGenerate={reGenerate}
        //                 toast={toast}
        //                 />
        //             :
        //             <AssistantChatItemRef
        //                 key={index} 
        //                 itemRef={chatListRefs[index]}
        //                 idx={index}
        //                 msgSize={messages.length}
        //                 message={message}
        //                 editableContentId={editableContentId}
        //                 setEditableContentId={setEditableContentId}
        //                 toast={toast}
        //             />
        //         })
        //     }
        //     <div ref={scrollEndRef} className="scrollEndRef"></div>
        // </div>

        <VList ref={chatListRef} className="scroll-smooth space-y-2" style={{ height: chatWindowHeight ? chatWindowHeight - 12 : 900 }}>
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

        // messages.map((message, index) => {
        //     if (!message.body || !message.body.content || message.body.content.length === 0) {
        //         return
        //     }
        //     return message.body.role == 'user' ?
        //     <UserChatItemRef
        //         key={index} 
        //         itemRef={chatListRefs[index]}
        //         idx={index}
        //         message={message}
        //         msgSize={messages.length}
        //         lastMsgStatus={lastMsgStatus}
        //         reGenerate={reGenerate}
        //         toast={toast}
        //         />
        //     :
        //     <AssistantChatItemRef
        //         key={index} 
        //         itemRef={chatListRefs[index]}
        //         idx={index}
        //         msgSize={messages.length}
        //         message={message}
        //         editableContentId={editableContentId}
        //         setEditableContentId={setEditableContentId}
        //         toast={toast}
        //     />
        // })
    )
}

