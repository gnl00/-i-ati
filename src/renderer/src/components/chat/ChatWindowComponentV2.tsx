import { Textarea } from '@renderer/components/ui/textarea'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { PaperPlaneIcon } from '@radix-ui/react-icons'

const ChatWindowComponentV2 = () => {
  return (
    <div className="h-svh relative app-undragable flex flex-col" style={{
      backgroundColor: '#f9f9f9',
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(139,125,102,0.15) 1px, transparent 0)`,
      backgroundSize: '50px 50px'
    }}>
      <div className='h-14 bg-gray-50 app-dragable'></div> {/* padding-area */}
      <div className="">chat-list</div>
      <div className="p-6 rounded-md fixed bottom-0 w-full h-52">
        <div className='relative bg-gray-50 h-full rounded-2xl'>
          <Textarea 
            style={{maxHeight: 'calc(100% - 2rem)'}}
            className="bg-gray-50 text-base p-2 h-full border-b-[0px]
              rounded-t-2xl resize-none pr-12 pb-12 overflow-y-auto" 
            placeholder='Type anything to chat'
            >input area
          </Textarea>
          <div className='absolute bottom-0 rounded-b-2xl z-10 w-full bg-[#F9FAFB] p-1 pl-4 flex border-b-[1px] border-l-[1px] border-r-[1px]'>
            <div className='flex-grow flex space-x-2 select-none relative'>
              <div><Badge>files</Badge></div>
              <div><Badge variant="secondary" className='bg-gray-200 hover:bg-gray-300 text-gray-600'>thinking</Badge></div>
              <div><Badge variant="secondary" className="bg-blue-500 text-white hover:bg-blue-300">search</Badge></div>
              <div><Badge variant="destructive">mcp</Badge></div>
              <div className='absolute right-0 bottom-0'><Button size={'sm'} className='rounded-2xl'><PaperPlaneIcon className="-rotate-45 mb-0.5 ml-0.5 w-8" /></Button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatWindowComponentV2