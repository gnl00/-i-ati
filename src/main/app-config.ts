import { app } from 'electron'
import { join } from 'path'
import * as fs from 'node:fs'
import { defaultConfig as embeddedConfig } from '../config'

const appDataPath = app.getPath('userData')
console.log('[@i] appDataPath=', appDataPath);

const configFile = join(appDataPath, 'appConfig.json')

let appConfig: AppConfigType

function tryInitConfig(): void {
  if (!fs.existsSync(appDataPath)) {
    console.log('[@i] Local config path not found, creating', appDataPath)
    fs.mkdirSync(appDataPath)
  }

  if (!fs.existsSync(configFile)) {
    console.log('[@i] Local config file not found, creating', configFile)
    const { configForUpdate, ...omitedConfig } = embeddedConfig
    fs.writeFileSync(configFile, JSON.stringify({ ...omitedConfig }, null, 2))
  }
}

function loadConfig(): void {
  console.log('[@i] Loading app configurations')

  tryInitConfig()

  console.log('[@i] Local config file=', configFile)
  const localConfigStr = fs.readFileSync(configFile).toString('utf8')
  const localConfig: AppConfigType = JSON.parse(localConfigStr)
  console.log('[@i] Got local config\n', JSON.stringify(localConfig))
  appConfig = {
    ...localConfig
  }
  // update local config when embedded config update
  console.log(`[@i] Local config version=${localConfig.version}, embedded config version=${embeddedConfig.version}`)
  console.log('[@i] Local config need to update?', embeddedConfig.version! > localConfig.version!)
  
  if (embeddedConfig.version! > localConfig.version!) {
    const { configForUpdate } = embeddedConfig
    appConfig = {
      ...appConfig,
      ...configForUpdate
    }
    saveConfig(appConfig)
  }
}

const saveConfig = (configData: AppConfigType): void => {
  const { configForUpdate, ...omitedConfig } = embeddedConfig
  const mergedConfig: AppConfigType = {
    ...omitedConfig, 
    ...configData 
  }
  fs.writeFileSync(configFile, JSON.stringify(mergedConfig, null, 2))
  console.log('[@i] Save merged config\n', JSON.stringify(mergedConfig))
}

export {
  appConfig,
  loadConfig,
  saveConfig
}