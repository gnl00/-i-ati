import { protocol } from 'electron'
import { IMAGE_ASSET_PROTOCOL } from '@shared/tools/image/types'
import { EMOTION_ASSET_PROTOCOL } from '@shared/emotion/constants'

export function registerMainProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: IMAGE_ASSET_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } },
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
