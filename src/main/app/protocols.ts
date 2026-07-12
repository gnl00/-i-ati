import { protocol } from 'electron'
import { EMOTION_ASSET_PROTOCOL } from '@shared/emotion/constants'

export function registerMainProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EMOTION_ASSET_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true
      }
    }
  ])
}
