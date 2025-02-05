import React, { useEffect, useRef, memo } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable"
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from "@renderer/lib/utils"
import bgSvgBlack128 from '../../assets/black-icon-128x128.svg'
import ChatListComponent from "@renderer/components/chat/ChatListComponent"
import ImageGalleryComponent from "@renderer/components/input/ImageGalleryComponent"
import ToolBarComponent from "@renderer/components/input/ToolBarComponent"
import InputAreaComponent from "@renderer/components/input/InputAreaComponent"
import { useChatStore } from "@renderer/store"
import { debounce } from 'lodash'
import chatSubmit from '@renderer/hooks/use-chat-submit'

const ChatWindowsComponent: React.FC = memo(() => {
  const { chatWindowHeight, setChatWindowHeight } = useChatStore()
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const scrollAreaTopRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    console.log('render []')

    const handleResize = debounce((entry: ResizeObserverEntry) => {
      // console.log('handleResize debounceSet', entry)
      setChatWindowHeight(entry.contentRect.height)
    }, 200)

    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach(entry => {
        handleResize(entry)
      })
    })

    if (chatWindowRef.current) {
      resizeObserver.observe(chatWindowRef.current)
    }

    return () => {
      if (chatWindowRef.current) {
        resizeObserver.unobserve(chatWindowRef.current)
      }
    }
  }, [chatWindowHeight, setChatWindowHeight])

  const onResizablePanelResize = (height: number) => {
    // Handle resize if needed
  };

  const onGroupResize = (heights: any) => {
    // Handle group resize if needed
  }
  return (
    <ResizablePanelGroup
      onLayout={onGroupResize}
      direction="vertical"
      className={cn("div-body w-full rounded-lg border min-h-screen", "pt-[54px]")}
    >
      <ResizablePanel defaultSize={80} onResize={onResizablePanelResize}>
        <div ref={chatWindowRef} className="app-undragable h-full flex flex-col pl-1 pr-1 gap-4 overflow-y-scroll transition-all duration-75 ease-in-out">
          <ScrollArea
            style={{ backgroundImage: `url(${bgSvgBlack128})` }}
            className="scroll-smooth app-undragable h-full w-full rounded-md border pt-2 bg-auto bg-center bg-no-repeat bg-clip-content relative"
          >
            <div id="scrollAreaTop" ref={scrollAreaTopRef}></div>
            <ChatListComponent chatWindowHeight={chatWindowHeight} regenChat={chatSubmit()} />
            <ImageGalleryComponent />
            <div id="scrollAreaBottom" />
            {/* <div className="abso lute bg-red-300 z-10 right-3 bottom-1 rounded-full p-2">End</div> */}
          </ScrollArea>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ToolBarComponent onSubmit={chatSubmit()} />
      <ResizablePanel defaultSize={20} minSize={15} maxSize={50}>
        <InputAreaComponent onSubmit={chatSubmit()} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
})

export default ChatWindowsComponent