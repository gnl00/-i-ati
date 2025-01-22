import React, { forwardRef, Ref, useState } from 'react'
import { cn } from "@renderer/lib/utils"
import { Textarea } from '@renderer/components/ui/textarea'
import { Button } from "@renderer/components/ui/button"
import { PaperPlaneIcon, StopIcon } from "@radix-ui/react-icons"
import { useChatStore } from '@renderer/store'
import { useChatContext } from '@renderer/context/ChatContext'

interface InputAreaProps {
    inputAreaRef?: Ref<HTMLTextAreaElement>
    onSubmit: (textCtx: string, mediaCtx: ClipbordImg[] | string[]) => Promise<void>
}

const InputAreaComponent: React.FC<InputAreaProps> = forwardRef<HTMLTextAreaElement, InputAreaProps>((props: InputAreaProps, inputAreaRef) => {
    const {onSubmit} = props
    const [compositionState, setCompositionState] = useState<boolean>(false) // inputMethod state
    const [localContent, setLocalContent] = useState<string>('')
    const {setChatContent} = useChatContext()
    const { currentReqCtrl, readStreamState, setReadStreamState, imageSrcBase64List, setImageSrcBase64List } = useChatStore()

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
            setLocalContent(value)
            // 将光标移动到换行符之后
            inputElement.selectionStart = start + 1
            inputElement.selectionEnd = start + 1
            return
        }
        if (e.key === 'Enter' && !compositionState) {
            e.preventDefault()
            setChatContent(localContent)
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
        setLocalContent('')
        setImageSrcBase64List([])
        onSubmitClick(localContent, imageSrcBase64List)
    }
    const onSubmitClick = async (textCtx: string, mediaCtx: ClipbordImg[] | string[]): Promise<void> => {
        onSubmit(textCtx, mediaCtx)
    }
    return (
        <div className="flex h-full w-full app-undragable">
            <div className="flex h-full w-full app-undragable">
                <Textarea
                    className="w-full text-md rounded-xl mb-0.5 border-0 border-input-0"
                    value={localContent}
                    ref={inputAreaRef}
                    placeholder="Anything you want to ask..."
                    onKeyDown={onTextAreaKeyDown}
                    onPaste={onTextAreaPaste}
                    onChange={e => { setLocalContent(e.currentTarget.value) }}
                    onCompositionStart={_ => { setCompositionState(true) }}
                    onCompositionEnd={_ => { setCompositionState(false) }}
                />
            </div>
        </div>
    )
})

export default React.memo(InputAreaComponent)