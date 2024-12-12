import {
  Button
} from "@renderer/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@renderer/components/ui/sheet"
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from "@renderer/lib/utils"
import { useEffect, useRef, useState } from "react"

export default () => {

  const [headerHeight, setHeaderHeight] = useState<number>(20) // State to keep track of header height
  const headerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight)
    }
  }, [])

  return (
    <div className="app-dragable">
      <div className="p-1">
      <Sheet>
        <div ref={headerRef} className="app-dragable fixed top-0 bg-blue-300 w-full">
          <SheetTrigger asChild className=""><Button>Open</Button></SheetTrigger>
        </div>
        <SheetContent side={"left"}>
          <SheetHeader>
            <SheetTitle>Are you absolutely sure?</SheetTitle>
            <SheetDescription>
              This action cannot be undone. This will permanently delete your account
              and remove your data from our servers.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
      </div>
      <ResizablePanelGroup
      direction="vertical"
      className={cn("min-h-[98.5vh] w-full rounded-lg border", "pt-[44px]")}
      >
        <ResizablePanel defaultSize={75}>
          <div className="flex h-full app-undragable ">
            <span className="font-semibold">Content</span>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={25} minSize={20} maxSize={50}>
          <div className="flex h-full app-undragable ">
            <Textarea className="w-full"></Textarea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}