import {
  createUserContextRecord,
  type AgentLoopInput,
  type LoopInputBootstrapper,
  type LoopInputBootstrapperInput
} from '@main/agent/contracts/HostRuntimeContracts'
import { mapChatContext } from './ChatContextMapper'

type HostRequestMetadata = {
  contextMessages?: ChatMessage[]
}

export class MainAgentLoopInputBootstrapper implements LoopInputBootstrapper {
  bootstrap(input: LoopInputBootstrapperInput): AgentLoopInput {
    const now = input.runtimeInfrastructure.runtimeClock.now()
    const metadata = (input.hostRequest.metadata || {}) as HostRequestMetadata
    const contextMessages = metadata.contextMessages || []
    const records = mapChatContext({
      messages: contextMessages,
      now,
      loopIdentityProvider: input.runtimeInfrastructure.loopIdentityProvider
    })

    return {
      run: input.run,
      records: records.length
        ? records
        : [
            createUserContextRecord({
              recordId: input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptRecordId(),
              timestamp: now,
              content: input.hostRequest.userContent
            })
          ],
      requestSpec: input.requestSpec,
      execution: input.execution
    }
  }
}
