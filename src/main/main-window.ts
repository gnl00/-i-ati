import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow

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
      sandbox: false,
      // Currently, electron-vite not support nodeIntegration. 
      // nodeIntegration: true,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', async () => {
    mainWindow.show()
  })

  // 监听 new-window 事件
  // mainWindow.webContents.on('new-window', (event, url) => {
  //   event.preventDefault() // 阻止默认行为（在应用内打开新窗口）
  //   shell.openExternal(url) // 使用系统默认浏览器打开链接
  // })

  // mainWindow.on('resize', async () => {
  //   const [width, height] = mainWindow.getSize();
  //   //console.log(`Window resized to ${width}x${height}`);
  // })

  // mainWindow.on('show', async () => {
  // })

  // mainWindow.on('focus', async () => {
  //   console.log('on-focus')
  // })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

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

export {
  mainWindow,
  createWindow,
  pinWindow,
  getWinPosition,
  setWinPosition,
}