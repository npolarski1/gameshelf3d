import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { fetchPlayniteGames, getPlayniteImagePath, launchGame, suggestGame } from './playnite'

// Register asset protocol
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true // Still recommended, we use the custom protocol
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Register asset protocol handler
  protocol.handle('asset', (request) => {
    const url = request.url.replace('asset://file/', '')
    const decodedPath = decodeURIComponent(url)
    const { pathToFileURL } = require('url')
    return net.fetch(pathToFileURL(decodedPath).href)
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers
  ipcMain.handle('get-games', async () => {
    return await fetchPlayniteGames()
  })

  ipcMain.handle('get-image-path', (_event, imageId) => {
    const filePath = getPlayniteImagePath(imageId)
    if (filePath) {
      return `asset://file/${encodeURIComponent(filePath)}`
    }
    return null
  })

  ipcMain.handle('launch-game', (_event, gameId) => {
    // Launch the game via Playnite CLI explicitly, bypassing Windows URI bugs
    launchGame(gameId)
  })

  ipcMain.handle('suggest-game', async () => {
    return await suggestGame()
  })

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
})
