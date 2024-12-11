import { Button } from '@renderer/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose
} from "@renderer/components/ui/sheet"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable"

export default () => {
  return (
    <div className="app-dragable flex w-full h-[96vh] bg-red-300">
        <div className="app-undragable p-1 w-full h-[100%] bg-blue-300">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Open</Button>
          </SheetTrigger>
          <SheetContent side={'left'}>
            <SheetHeader>
              <SheetTitle>Edit profile</SheetTitle>
              <SheetDescription>
                Make changes to your profile here. Click save when you're done.
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 py-4">
            </div>
            <SheetFooter>
              <SheetClose asChild>
                <Button type="submit">Save changes</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={75}>One</ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={25} minSize={10} maxSize={55} className='bg-yellow-300 max-h-[20%]'>Two</ResizablePanel>
        </ResizablePanelGroup>
        </div>
    </div>
  )
}