import { VList, VListHandle } from "virtua"
import List, { ListRef } from 'rc-virtual-list'
import React, { useEffect, useRef, Ref, RefObject, useMemo, useLayoutEffect, forwardRef } from "react"
import { UserChatItem, UserChatItemRef, AssistantChatItem, AssistantChatItemRef } from "./ChatItemComponent"
import { debounce } from 'lodash'

interface ChatItemProps {
    id: number;
    height: number;
    message?: MessageEntity;
    messageSize: number
    toast: Function
    lastMsgStatus: boolean
    reGenerate: Function
    editableContentId: number
    setEditableContentId: Function
}

const ChatItemRef: React.FC<ChatItemProps> = forwardRef<HTMLDivElement, ChatItemProps>((props, ref) => {
    const { id, height, message, messageSize, lastMsgStatus, reGenerate, editableContentId, setEditableContentId, toast } = props
    if (message == undefined || !message.body || !message.body.content || message.body.content.length === 0) return <></>
    return (
        <div ref={ref}
            style={{
                border: '1px solid gray',
                height: '100%',
                boxSizing: 'border-box',
                display: 'inline-block',
            }}
            className="pr-2 pl-2 flex flex-col space-y-4"
        >
            {
                message.body.role == 'user' ?
                <UserChatItemRef
                key={id} 
                idx={id}
                message={message}
                msgSize={messageSize}
                lastMsgStatus={lastMsgStatus}
                reGenerate={reGenerate}
                toast={toast}
                />
                :
                <AssistantChatItemRef
                    key={id} 
                    idx={id}
                    msgSize={messageSize}
                    message={message}
                    editableContentId={editableContentId}
                    setEditableContentId={setEditableContentId}
                    toast={toast}
                />
            }
        </div>
    )
})

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
    const chatListRef = useRef<ListRef>(null)
    useEffect(() => {
        const debouncedScrollToIndex = debounce(() => {
            chatListRef.current?.scrollTo({
                index: messages.length - 1,
                align: 'bottom'
            })
        }, 10)
        debouncedScrollToIndex()
        return () => {
            debouncedScrollToIndex.cancel();
        }
    }, [messages])
    const data: ChatItemProps[] = []
    for (let i = 0; i < messages.length; i += 1) {
        data.push({
            id: i,
            height: 300,
            message: messages[i],
            lastMsgStatus,
            reGenerate,
            toast,
            editableContentId,
            setEditableContentId,
            messageSize: messages.length
        });
    }
    return (
        <div>
            <List
            data={data}
            height={chatWindowHeight ? chatWindowHeight - 18 : 900}
            itemHeight={30}
            itemKey="id"
            ref={chatListRef}
            style={{
                scrollBehavior: 'smooth',
                transition: 'all 0.3s ease'
            }}
            className="smooth-scroll"
            >
                {item => <ChatItemRef {...item} />}
            </List>
            <div className="scrollEndDiv"></div>
        </div>
    )
}

