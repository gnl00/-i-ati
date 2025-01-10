import React, { forwardRef, Ref, useState } from 'react';
import { cn } from "@renderer/lib/utils"
import { Textarea } from '@renderer/components/ui/textarea'
import { Button } from "@renderer/components/ui/button"
import { PaperPlaneIcon, StopIcon } from "@radix-ui/react-icons"
import { useChatContext } from '@renderer/context/ChatContext';

interface InputAreaProps {
    textAreaRef: Ref<HTMLTextAreaElement>
    readStreamState: boolean
    onSubmitClick: (content: string, imageSrcBase64List: ClipbordImg[]) => void
    onStopBtnClick: () => void
}

const InputArea: React.FC<InputAreaProps> = forwardRef<HTMLTextAreaElement, InputAreaProps>(
    ({
      readStreamState,
      onSubmitClick,
      onStopBtnClick,
      }, textAreaRef
    ) => {
    const [chatContent, setChatContent] = useState<string|undefined>()
    const [compositionState, setCompositionState] = useState<boolean>(false) // inputMethod state
    const { imageSrcBase64List, setImageSrcBase64List } = useChatContext();
    const onChatContentChange = (event) => {
      setChatContent(event.currentTarget.value)
    }
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
    const onCompositionStart = e => {
      setCompositionState(true)
    }
    const onCompositionEnd = e => {
        setCompositionState(false)
    }
    const onInputAreaSubmit = () => {
      onSubmitClick(chatContent as string, imageSrcBase64List)
      setChatContent('')
    }
    return (
      <div className="flex h-full w-full app-undragable">
        <div className="flex h-full w-full app-undragable">
            <Textarea
                className="w-full text-md pb-2"
                value={chatContent}
                ref={textAreaRef}
                placeholder="Anything you want to ask..."
                onKeyDown={onTextAreaKeyDown}
                onPaste={onTextAreaPaste}
                onChange={onChatContentChange}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
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
  )}
);

export default InputArea;