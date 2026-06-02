import type { LoopInputBootstrapper, LoopInputBootstrapperInput } from '@main/agent/runtime/host/bootstrap/LoopInputBootstrapper'
import type { AgentLoopInput } from '@main/agent/runtime/loop/AgentLoopInput'
import {
  DefaultChatInitialTranscriptRecordFactory,
  type ChatInitialTranscriptRecordFactory
} from './ChatInitialTranscriptRecordFactory'
import type { ChatInitialTranscriptSeed } from './ChatInitialTranscriptSeed'

type HostRequestMetadata = {
  initialTranscriptSeed?: ChatInitialTranscriptSeed[]
}

export class MainAgentLoopInputBootstrapper implements LoopInputBootstrapper {
  constructor(
    private readonly initialTranscriptRecordFactory: ChatInitialTranscriptRecordFactory = new DefaultChatInitialTranscriptRecordFactory()
  ) {}

  bootstrap(input: LoopInputBootstrapperInput): AgentLoopInput {
    const now = input.runtimeInfrastructure.runtimeClock.now()
    const metadata = (input.hostRequest.metadata || {}) as HostRequestMetadata
    const initialTranscriptSeed = metadata.initialTranscriptSeed || []
    const transcriptId = input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptId()
    const records = this.initialTranscriptRecordFactory.create({
      initialTranscriptSeed,
      now,
      loopIdentityProvider: input.runtimeInfrastructure.loopIdentityProvider
    })

    const transcript = input.initialTranscriptMaterializer.materialize({
      transcriptId,
      createdAt: records[0]?.timestamp ?? now,
      updatedAt: records[records.length - 1]?.timestamp ?? now,
      records: records.length > 0
        ? records
        : [
            input.userRecordMaterializer.materialize({
              recordId: input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptRecordId(),
              timestamp: now,
              content: input.hostRequest.userContent
            })
          ]
    })

    return {
      run: input.run,
      transcript,
      requestSpec: input.requestSpec,
      execution: input.execution
    }
  }
}
