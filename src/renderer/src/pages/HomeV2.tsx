import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@renderer/components/ui/resizable"
import { Toaster } from "@renderer/components/ui/toaster"
// import { toast as SonnerToast, Toaster as SonnerToaster } from "sonner"
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from "@renderer/lib/utils"
import { useEffect, useRef, useState } from "react"
import bgSvgBlack128 from '../assets/black-icon-128x128.svg'
import InputArea from "@renderer/components/input/InputAreaComp"
import { ChatProvider } from "@renderer/context/ChatContext"
import ImageGalleryComp from "@renderer/components/input/ImageGalleryComp"
import { ChatComponent } from "@renderer/components/chat/ChatComponent"
import ToolBarComp from "@renderer/components/input/ToolBarComp"
import ChatSheet from "@renderer/components/sys/ChatSheet"
import ChatSheetHoverComp from "@renderer/components/sys/ChatSheetHoverComp"
import Header from "@renderer/components/sys/Header"

export default () => {
    const [chatWindowHeight, setChatWindowHeight] = useState(800)

    const scrollAreaTopRef = useRef<HTMLDivElement>(null)
    const chatWindowRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        console.log('render []')
        const resizeObserver = new ResizeObserver((entries) => {
            entries.forEach(entry => {
                setChatWindowHeight(entry.contentRect.height)
            });
        })
        if (chatWindowRef.current) {
            resizeObserver.observe(chatWindowRef.current);
        }
        return () => { }
    }, [])

    return (
        <div className="div-app app-dragable flex flex-col">
            <Toaster />
            <ChatProvider>
                <Header />
                <ResizablePanelGroup
                    // onLayout={onResizablePanelResize}
                    direction="vertical"
                    className={cn("div-body w-full rounded-lg border min-h-screen", "pt-[54px]")}
                    >
                    <ResizablePanel defaultSize={80}>
                        <div ref={chatWindowRef} className="app-undragable h-full flex flex-col pl-1 pr-1 gap-4 overflow-y-scroll">
                            <ScrollArea
                                style={{ backgroundImage: `url(${bgSvgBlack128})` }}
                                className="scroll-smooth app-undragable h-full w-full rounded-md border pt-2 bg-auto bg-center bg-no-repeat bg-clip-content relative">
                                <div id="scrollAreaTop" ref={scrollAreaTopRef}></div>
                                <ChatComponent chatWindowHeight={chatWindowHeight} />
                                <ImageGalleryComp />
                                <div id="scrollAreaBottom" />
                            </ScrollArea>
                        </div>
                    </ResizablePanel>
                    <ResizableHandle />
                    <ToolBarComp />
                    <ResizablePanel defaultSize={20} minSize={15} maxSize={50}><InputArea /></ResizablePanel>
                </ResizablePanelGroup>
                <ChatSheetHoverComp />
                {/* Sheet Section */}
                <ChatSheet />
            </ChatProvider>
        </div>
    )
}
