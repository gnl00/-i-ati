import { Textarea } from '@renderer/components/ui/textarea'

const ChatWindowComponentV2 = () => {
  return (
    <div className="bg-red-100 pt-14 h-svh relative app-undragable flex flex-col">
      <div className="">chat-list</div>
      <div className="bg-green-100 p-6 rounded-md fixed bottom-0 w-full h-44">
        <div className='relative h-full bg-blue-100'>
          <Textarea className="bg-gray-100 rounded-2xl p-2">input area
          </Textarea>
          <div className=''>tool area</div>
        </div>
      </div>
    </div>
  )
}

export default ChatWindowComponentV2