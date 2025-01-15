import React, { forwardRef, Ref, useState } from 'react'
import { cn } from "@renderer/lib/utils"
import { Textarea } from '@renderer/components/ui/textarea'
import { Button } from "@renderer/components/ui/button"
import { PaperPlaneIcon, StopIcon } from "@radix-ui/react-icons"
import { useChatContext } from '@renderer/context/ChatContext'
import { saveMessage } from '@renderer/db/MessageRepository'
import { updateChat } from '@renderer/db/ChatRepository'
import { getChatById } from '@renderer/db/ChatRepository'
import { saveChat } from '@renderer/db/ChatRepository'
import { chatRequestWithHook, chatRequestWithHookV2 } from '@request/index'
import { v4 as uuidv4 } from 'uuid'
import { toast } from '../ui/use-toast'

interface InputAreaProps {
    inputAreaRef?: Ref<HTMLTextAreaElement>
}

const generateTitlePrompt = "Generate a briefly and precisely title from the context below. NOTE: RETURN ME THE TITLE ONLY.\n"

const InputArea: React.FC<InputAreaProps> = forwardRef<HTMLTextAreaElement, InputAreaProps>((props: InputAreaProps, inputAreaRef) => {
    const [chatContent, setChatContent] = useState<string | undefined>()
    const [compositionState, setCompositionState] = useState<boolean>(false) // inputMethod state
    const [fetchState, setFetchState] = useState<boolean>()
    const [currentReqCtrl, setCurrReqCtrl] = useState<AbortController>()
    const [readStreamState, setReadStreamState] = useState<boolean>(false)

    const { 
        chatId, setChatId, 
        chatUuid, setChatUuid, 
        chatTitle, setChatTitle,
        imageSrcBase64List, setImageSrcBase64List, 
        updateChatList, 
        selectedModel, setLastMsgStatus,
        messages, setMessages,
        provider,
        models,
    } = useChatContext();

    const onTextAreaKeyDown = (e) => {
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault() // 防止跳到新的一行
            // console.log('Shift + Enter pressed!')
            const inputElement = e.target
            const start = inputElement.selectionStart
            const end = inputElement.selectionEnd
            // 获取当前输入框的内容
            let value = inputElement.value
            // 在光标位置插入换行符
            value = value.substring(0, start) + "\n" + value.substring(end)
            // 更新
            inputElement.value = value
            setChatContent(value)
            // 将光标移动到换行符之后
            inputElement.selectionStart = start + 1
            inputElement.selectionEnd = start + 1
            return
        }
        if (e.key === 'Enter' && !compositionState) {
            e.preventDefault()
            onInputAreaSubmit()
        }
    }
    const onTextAreaPaste = (event) => {
        // const text = e.clipboardData.getData('text/plain')
        const items = (event.clipboardData || event.originalEvent.clipboardData).items
        let blob = null

        let findImg: boolean = false
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                // 找到图片类型的数据
                blob = items[i].getAsFile()
                findImg = true
                break
            }
        }
        console.log(`findImg? ${findImg}`)
        if (blob) {
            const reader = new FileReader()
            // 以 Data URL 的形式读取文件内容
            reader.readAsDataURL(blob)
            reader.onloadend = () => {
                // 设置图片的 src 属性为读取到的数据 URL
                // console.log(reader.result) // base64 格式的图片数据
                setImageSrcBase64List([...imageSrcBase64List, reader.result])
            }
        }
    }
    const onInputAreaSubmit = () => {
        setChatContent('')
        setImageSrcBase64List([])
        onSubmitClick(chatContent as string, imageSrcBase64List)
    }
    const onSubmitClick = async (textCtx: string, mediaCtx: ClipbordImg[] | string[]): Promise<void> => {
        if (!textCtx) {
            return
        }

        let messageBody: ChatMessage
        const modelType = models.filter(md => md.value === selectedModel)[0].type
        if (modelType === 'llm') {
            messageBody = { role: "user", content: textCtx.trim() } as ChatMessage
        } else if (modelType === 'vlm') {
            const imgContents: VLMContent[] = []
            mediaCtx.forEach(imgBase64 => {
                imgContents.push({ type: 'image_url', image_url: { url: imgBase64 as string, detail: 'auto' } })
            })
            messageBody = { role: "user", content: [...imgContents, { type: 'text', text: textCtx.trim() }] }
        } else {
            return
        }

        const userMessageEntity: MessageEntity = { body: messageBody }
        const usrMsgId = await saveMessage(userMessageEntity) as number
        console.log(`modelType=${modelType} msgId=${usrMsgId}`, userMessageEntity)

        let currChatId = chatId
        let chatEntity: ChatEntity
        if (!chatUuid && !chatId) {
            const currChatUuid = uuidv4()
            setChatUuid(currChatUuid)
            chatEntity = { uuid: currChatUuid, title: 'NewChat', messages: [usrMsgId], createTime: new Date().getTime(), updateTime: new Date().getTime() }
            const saveChatRetVal = await saveChat(chatEntity)
            currChatId = saveChatRetVal as number
            setChatId(currChatId)
            chatEntity.id = currChatId
        } else {
            chatEntity = await getChatById(currChatId)
            chatEntity.messages = [...chatEntity.messages, usrMsgId]
            chatEntity.updateTime = new Date().getTime()
            updateChat(chatEntity)
        }
        updateChatList(chatEntity)

        const messageEntities = [...messages, userMessageEntity]
        setMessages(messageEntities)

        const req: IChatRequestV2 = {
            url: provider.apiUrl,
            messages: messageEntities.map(msg => msg.body),
            token: provider.apiKey,
            prompt: '',
            model: selectedModel!
        }

        const controller = new AbortController()
        setCurrReqCtrl(controller)
        const signal = controller.signal

        let gatherResult = ''
        chatRequestWithHookV2(req, signal, beforeFetch, afterFetch)
            .then(async (reader) => {
                if (reader) {
                    setReadStreamState(true)
                    while (true) {
                        const { done, value } = await reader.read()
                        if (done) {
                            break
                        }
                        let eventDone = false
                        const arr = value.split('\n')
                        arr.forEach((data: any) => {
                            if (data.length === 0) return // ignore empty message
                            if (data.startsWith(':')) return // ignore sse comment message
                            if (data === 'data: [DONE]') {
                                eventDone = true
                                return
                            }
                            const json = JSON.parse(data.substring(('data:'.length + 1))) // stream response with a "data:" prefix
                            const resultText = json.choices[0].delta.content
                            gatherResult += resultText || ''
                        })
                        setMessages([...messages, userMessageEntity, { body: { role: 'system', content: gatherResult } }])
                        if (eventDone) {
                            break
                        }
                    }
                }
                setLastMsgStatus(true)
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    toast({
                        variant: "destructive",
                        title: "Uh oh! Something went wrong.",
                        description: `There was a problem with your request. ${err.message}`
                    })
                }
                setLastMsgStatus(false)
            })
            .finally(async () => {
                setReadStreamState(false)
                const sysMessageEntity: MessageEntity = { body: { role: 'system', content: gatherResult } }
                const sysMsgId = await saveMessage(sysMessageEntity) as number
                chatEntity.messages = [...chatEntity.messages, sysMsgId]
                if (!chatTitle || chatTitle === 'NewChat') {
                    const title = await generateTitle(textCtx) as string
                    chatEntity.title = title
                }
                chatEntity.updateTime = new Date().getTime()
                updateChat(chatEntity)
                updateChatList(chatEntity)
            })
    }
    const beforeFetch = () => {
        setFetchState(true)
    }

    const afterFetch = () => {
        setFetchState(false)
    }
    const generateTitle = async (context) => {
        const titleReq: IChatRequest = {
            url: provider.apiUrl,
            content: generateTitlePrompt + context,
            token: provider.apiKey,
            prompt: '',
            model: 'Qwen/Qwen2.5-14B-Instruct'
        }

        const reader = await chatRequestWithHook(titleReq, () => { }, () => { })
        if (!reader) {
            return
        }
        let title = ''
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            let eventDone = false
            const arr = value.split('\n')
            arr.forEach((data: any) => {
                if (data.length === 0) return // ignore empty message
                if (data.startsWith(':')) return // ignore sse comment message
                if (data === 'data: [DONE]') {
                    eventDone = true
                    return
                }
                const json = JSON.parse(data.substring(('data:'.length + 1))) // stream response with a "data:" prefix
                const resultText = json.choices[0].delta.content
                title += resultText || ''
                // console.log(preResult += resultText || '')
            })
            setChatTitle(title)
            if (eventDone) {
                break
            }
        }
        return title
    }
    const onStopBtnClick = () => {
        if (currentReqCtrl) {
            currentReqCtrl.abort()
            setReadStreamState(false)
        }
    }
    return (
        <div className="flex h-full w-full app-undragable">
            <div className="flex h-full w-full app-undragable">
                <Textarea
                    className="w-full text-md pb-2"
                    value={chatContent}
                    ref={inputAreaRef}
                    placeholder="Anything you want to ask..."
                    onKeyDown={onTextAreaKeyDown}
                    onPaste={onTextAreaPaste}
                    onChange={e => {setChatContent(e.currentTarget.value)}}
                    onCompositionStart={_ => {setCompositionState(true)}}
                    onCompositionEnd={_ => {setCompositionState(false)}}
                />
            </div>
            {(!readStreamState ? (
                <Button
                    className={cn(
                        "fixed bottom-0 right-0 mr-2 mb-1.5 flex items-center transition-transform duration-500 hover:scale-120 hover:-translate-y-1 hover:-translate-x-1",
                        readStreamState ? "-translate-x-full opacity-0" : ""
                    )}
                    type="submit"
                    onClick={onInputAreaSubmit}
                >
                    Enter&ensp;<PaperPlaneIcon className="-rotate-45 mb-1.5" />
                </Button>
            ) : (
                <Button
                    className={cn(
                        "fixed bottom-0 right-0 mr-2 mb-1.5 flex items-center animate-bounce transition-transform duration-700 hover:scale-120 hover:-translate-y-1 hover:-translate-x-1",
                        readStreamState ? "" : "-translate-x-full opacity-0"
                    )}
                    variant="destructive"
                    type="submit"
                    onClick={onStopBtnClick}
                >
                    Stop&ensp;<StopIcon />
                </Button>
            ))}
        </div>
    )
}
);

export default InputArea;