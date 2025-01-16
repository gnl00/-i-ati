import { Toaster } from "@renderer/components/ui/toaster"
// import { toast as SonnerToast, Toaster as SonnerToaster } from "sonner"
import { ChatProvider } from "@renderer/context/ChatContext"
import ChatSheet from "@renderer/components/sys/ChatSheet"
import ChatSheetHoverComp from "@renderer/components/sys/ChatSheetHoverComp"
import Header from "@renderer/components/sys/Header"
import ChatWindowsComponent from "@renderer/components/chat/ChatWindowsComponent"

export default () => {
    return (
        <div className="div-app app-dragable flex flex-col">
            <Toaster />
            <ChatProvider>
                <Header />
                <ChatWindowsComponent />
                <ChatSheetHoverComp />
                {/* Sheet Section */}
                <ChatSheet />
            </ChatProvider>
        </div>
    )
}
