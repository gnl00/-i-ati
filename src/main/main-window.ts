import { app, shell, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import icon from '../../build/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let onWindowCreatedCallback: ((window: BrowserWindow) => void) | null = null
let appQuitting = false

function getMainWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null
  }

  return mainWindow
}

function setMainWindowAppQuitting(quitting: boolean): void {
  appQuitting = quitting
}

function createWindow(onCreated?: (window: BrowserWindow) => void): void {
  if (onCreated) {
    onWindowCreatedCallback = onCreated
  }

  const existingWindow = getMainWindow()
  if (existingWindow) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore()
    }
    existingWindow.show()
    existingWindow.focus()
    return
  }

  // Create the browser window.
  const window = new BrowserWindow({
    width: 770,
    height: 850,
    show: false,
    // alwaysOnTop: true,
    frame: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Keep the renderer sandboxed and expose only the preload bridge surface.
      sandbox: true,
      contextIsolation: true,
      webSecurity: true
    }
  })
  mainWindow = window

  window.on('ready-to-show', async () => {
    window.show()
  })

  window.on('close', (event) => {
    if (process.platform === 'darwin' && !appQuitting) {
      event.preventDefault()
      // On macOS, treat the red close button as "hide app" so Dock re-activation
      // can restore the app via the native unhide flow instead of recreating UI state.
      app.hide()
    }
  })

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
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

  window.on('focus', () => {
    // Clear the Dock badge whenever the user returns to the app (notification click, Cmd-Tab, or Dock activation all route through focus).
    app.badgeCount = 0
  })

  window.webContents.setWindowOpenHandler((details) => {
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
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (onWindowCreatedCallback) {
    onWindowCreatedCallback(window)
  }

  // @ts-ignore
  if (import.meta.env.MODE === 'development') {
    window.webContents.openDevTools({ mode: 'right' })
  }
}

const pinWindow = (pin: boolean): void => {
  getMainWindow()?.setAlwaysOnTop(pin, 'floating')
}

const getWinPosition = (): number[] => {
  return getMainWindow()?.getPosition() ?? [0, 0]
}

const setWinPosition = ({x, y, animation= true}): void => {
  getMainWindow()?.setPosition(x, y, animation)
}

const windowsMinimize = () => {
  getMainWindow()?.minimize()
}

const windowsMaximize = () => {
  const window = getMainWindow()
  if (!window) {
    return
  }

  if (window.isMaximized()) {
    window.unmaximize()
  } else {
    window.maximize()
  }
}

const windowsClose = () => {
  getMainWindow()?.close()
}

function showMainWindow(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()

  // Force-activate the app even when the user is in another app (macOS).
  app.focus({ steal: true })

  // Temporarily float the window above other apps' windows, then restore.
  // Preserve the user's own always-on-top (pin) setting.
  const wasAlwaysOnTop = win.isAlwaysOnTop()
  win.setAlwaysOnTop(true, 'floating')
  win.show()
  win.focus()

  setTimeout(() => {
    if (win.isDestroyed()) return
    win.setAlwaysOnTop(wasAlwaysOnTop, wasAlwaysOnTop ? 'floating' : 'normal')
  }, 100)
}

function isMainWindowForeground(): boolean {
  const win = getMainWindow()
  return !!win && win.isVisible() && win.isFocused()
}

export {
  mainWindow,
  getMainWindow,
  createWindow,
  setMainWindowAppQuitting,
  pinWindow,
  getWinPosition,
  setWinPosition,
  windowsMinimize,
  windowsMaximize,
  windowsClose,
  showMainWindow,
  isMainWindowForeground
}
