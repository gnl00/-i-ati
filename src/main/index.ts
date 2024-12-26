import { app, session, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import * as fs from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { PIN_WINDOW, SAVE_CONFIG, GET_CONFIG, OPEN_EXTERNAL } from '../constants'
import { defaultConfig as embeddedConfig } from '../config'
import path from 'node:path'
import os from 'node:os'

let mainWindow: BrowserWindow
let appConfig: AppConfigType

const configPath = app.getPath('userData')
const configFile = join(configPath, 'appConfig.json')

function tryInitConfig(): void {
  if (!fs.existsSync(configPath)) {
    console.log('no local config PATH, creating...', configPath)
    fs.mkdirSync(configPath)
  }

  if (!fs.existsSync(configFile)) {
    console.log('no local config FILE, creating...', configFile)
    const { configForUpdate, ...omitedConfig } = embeddedConfig
    fs.writeFileSync(configFile, JSON.stringify({ ...omitedConfig }, null, 2))
  }
}

function handleConfig(): void {
  console.log('handling configurations...')

  tryInitConfig()

  console.log('local config file\n', configFile)
  const localConfigStr = fs.readFileSync(configFile).toString('utf8')
  const localConfig: AppConfigType = JSON.parse(localConfigStr)
  console.log('got local config\n', localConfig)
  appConfig = {
    ...localConfig
  }
  // update local config when default config update
  if (!localConfig.version || embeddedConfig!.version! > localConfig.version) {
    const { configForUpdate } = embeddedConfig
    appConfig = {
      ...appConfig,
      ...configForUpdate
    }
    saveConfig(appConfig)
    console.log('refresh local config\n', appConfig)
  }
}

const saveConfig = (configData: AppConfigType): void => {
  const { configForUpdate, ...omitedConfig } = embeddedConfig
  const mergedConfig: AppConfigType = {
    ...omitedConfig, 
    ...configData 
  }
  
  console.log('saving merged config\n', mergedConfig)
  
  fs.writeFileSync(configFile, JSON.stringify(mergedConfig, null, 2))
  console.log('configurations save success')
}

handleConfig()

const pinWindow = (pin: boolean): void => {
  mainWindow.setAlwaysOnTop(pin, 'floating')
}

const getWinPosition = (): number[] => {
  return mainWindow.getPosition()
}

const setWinPosition = ({x, y, animation= true}): void => {
  mainWindow.setPosition(x, y, animation)
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 1200,
    show: false,
    // alwaysOnTop: true,
    frame: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
      // Currently, electron-vite not support nodeIntegration. 
      // nodeIntegration: true,
      // contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', async () => {
    mainWindow.show()
  })

  // mainWindow.on('resize', async () => {
  //   const [width, height] = mainWindow.getSize();
  //   //console.log(`Window resized to ${width}x${height}`);
  // })

  // mainWindow.on('show', async () => {
  // })

  // mainWindow.on('focus', async () => {
  //   console.log('on-focus')
  // })

  // mainWindow.webContents.setWindowOpenHandler((details) => {
  //   shell.openExternal(details.url)
  //   return { action: 'deny' }
  // })

  // mainWindow.webContents.on('did-finish-load', () => {
  //   // mainWindow.webContents.send('main-process-message', new Date().toLocaleString())
  //   mainWindow.setTitle('New Async Title')
  // })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // @ts-ignore
  if (import.meta.env.MODE === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'right' })
  }
  
}

const reactDevToolsPath = path.join(
  os.homedir(),
  'Library/Application Support/Google/Chrome/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/6.0.1_0'
)

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  await session.defaultSession.loadExtension(reactDevToolsPath)
  
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  // globalShortcut.unregister("Esc")
  // globalShortcut.register('CtrlOrCmd+Esc', () => {
  //   mainWindow.hide()
  // })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // get config
  // macOS  /Users/{USERNAME}/Library/'Application Support'/electron-app
  // Linux /home/{USERNAME}/.config/electron-app
  console.log(app.getPath('userData'))

  // IPC
  ipcMain.handle(PIN_WINDOW, (_, pinState) => pinWindow(pinState))
  ipcMain.handle(SAVE_CONFIG, (_, config) => saveConfig(config))
  ipcMain.handle('get-win-position', (): number[] => getWinPosition())
  ipcMain.handle('set-position', (_, options) => setWinPosition(options))
  ipcMain.handle(GET_CONFIG, (): IAppConfig => appConfig)
  ipcMain.handle(OPEN_EXTERNAL, (_, url) => {
    console.log('main received url', url);
    shell.openExternal(url)
  })
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
  globalShortcut.unregisterAll()
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
