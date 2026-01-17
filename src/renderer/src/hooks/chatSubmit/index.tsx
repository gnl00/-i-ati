import { useChatContext } from '@renderer/context/ChatContext'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { ChatDependencyContainer } from './container'
import { useRef } from 'react'
import type { ChatPipelineMachineV2 } from './machine'

function useChatSubmitV2() {
  // 收集依赖
  const chatContext = useChatContext()
  const chatStore = useChatStore()
  const appConfig = useAppConfigStore()

  // 创建容器
  // 注意：不使用 useMemo，因为 Zustand store 每次渲染都会返回新的对象引用
  // Container 创建开销很小，直接创建即可
  const container = new ChatDependencyContainer(chatContext, chatStore, appConfig)

  const activeMachineRef = useRef<ChatPipelineMachineV2 | null>(null)

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[], prompt: string }
  ): Promise<void> => {
    if (activeMachineRef.current) {
      return
    }
    const machine = container.createMachine()
    activeMachineRef.current = machine

    try {
      await machine.start({
        prepareParams: container.buildPrepareParams({
          textCtx,
          mediaCtx,
          tools: options.tools,
          prompt: options.prompt
        }),
        finalizeDeps: container.buildFinalizeDeps()
      })
    } catch (error: any) {
      container.resetStates()

      if (error.name !== 'AbortError') {
        // 将错误添加到已创建的初始 assistant 消息中
        await chatStore.updateLastAssistantMessageWithError(error)
      }
    } finally {
      activeMachineRef.current = null
      chatStore.setCurrentReqCtrl(undefined)
    }
  }

  const cancel = () => {
    const machine = activeMachineRef.current
    if (machine) {
      machine.cancel()
    }
    activeMachineRef.current = null
    container.resetStates()
    chatStore.setCurrentReqCtrl(undefined)
  }

  return { onSubmit, cancel }
}

export default useChatSubmitV2
