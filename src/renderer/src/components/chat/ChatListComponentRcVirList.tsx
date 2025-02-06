import List, { ListRef } from 'rc-virtual-list'
import React, { useEffect, useRef, forwardRef, useState } from "react"
import { UserChatItemRef, AssistantChatItemRef } from "./ChatItemComponent"
import { debounce } from 'lodash'
import { useChatStore } from '@renderer/store';

interface ChatItemProps {
    id: number;
    height: number;
    message?: MessageEntity;
    messageSize: number
    regenChat: (textCtx: string, mediaCtx: ClipbordImg[] | string[]) => Promise<void>
}

const ChatItemRef: React.FC<ChatItemProps> = forwardRef<HTMLDivElement, ChatItemProps>((props, ref) => {
    const { id, height, message, messageSize, regenChat} = props
    const [editableContentId, setEditableContentId] = useState(-1)
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
                reGenerate={(textCtx, mediaCtx) => regenChat(textCtx, mediaCtx)}
                />
                :
                <AssistantChatItemRef
                    key={id} 
                    idx={id}
                    msgSize={messageSize}
                    message={message}
                    editableContentId={editableContentId}
                    setEditableContentId={setEditableContentId}
                />
            }
        </div>
    )
})

interface ChatListProps {
    chatWindowHeight?: number
    regenChat: (textCtx: string, mediaCtx: ClipbordImg[] | string[]) => Promise<void>
}

const ChatListComponent = (props: ChatListProps) => {
    const { regenChat, chatWindowHeight } = props
    const { messages, fetchState } = useChatStore()
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
            regenChat,
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
            // style={{
            //     scrollBehavior: 'smooth',
            //     transition: 'all 0.3s ease'
            // }}
            className="smooth-scroll"
            >
                {item => <ChatItemRef {...item} />}
            </List>
            <div className="scrollEndDiv"></div>
        </div>
    )
}

export default ChatListComponent

