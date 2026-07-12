import { MainApplication } from './app/MainApplication'
import { registerMainProtocolSchemes } from './app/protocols'

registerMainProtocolSchemes()

const mainApplication = new MainApplication()
mainApplication.registerLifecycle()
