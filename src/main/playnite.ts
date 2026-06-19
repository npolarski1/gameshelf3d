import fs from 'fs'
import path from 'path'

export interface PlayniteGame {
  id: string
  name: string
  coverImage?: string
  isInstalled: boolean
  installDirectory?: string
}

export function getPlayniteLibraryPath(): string {
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local')
  return path.join(appData, 'Playnite', 'library')
}

export async function fetchPlayniteGames(): Promise<PlayniteGame[]> {
  const exportPath = path.join(__dirname, '../../playnite_export.json')
  
  if (!fs.existsSync(exportPath)) {
    console.error(`Playnite export not found at: ${exportPath}. Please run the Playnite extension.`)
    return [
      { id: 'mock-1', name: 'Mock Game 1', isInstalled: true },
      { id: 'mock-2', name: 'Mock Game 2', isInstalled: true },
      { id: 'mock-3', name: 'Mock Game 3', isInstalled: true }
    ]
  }

  try {
    const data = fs.readFileSync(exportPath, 'utf8').replace(/^\uFEFF/, '')
    const rawGames = JSON.parse(data)
    
    // Convert to PlayniteGame format
    return rawGames.map((row: any) => {
      let imageUrl: string | undefined
      if (row.coverImage) {
        const filePath = getPlayniteImagePath(row.coverImage)
        if (filePath) {
          imageUrl = `asset://file/${encodeURIComponent(filePath)}`
        }
      }
      return {
        id: row.id,
        name: row.name,
        coverImage: row.coverImage,
        imageUrl: imageUrl,
        isInstalled: row.isInstalled,
        installDirectory: row.installDirectory
      }
    })
  } catch (err) {
    console.error('Failed to read Playnite export:', err)
    return [
      { id: 'mock-1', name: 'Mock Game 1', isInstalled: true },
      { id: 'mock-2', name: 'Mock Game 2', isInstalled: true },
      { id: 'mock-3', name: 'Mock Game 3', isInstalled: true }
    ]
  }
}

export function getPlayniteImagePath(imageId: string): string | null {
  if (!imageId) return null
  const libraryPath = getPlayniteLibraryPath()
  const filesPath = path.join(libraryPath, 'files')
  const filePath = path.join(filesPath, imageId)
  
  if (fs.existsSync(filePath)) {
    return filePath
  }
  
  return null
}

export function getPlayniteExecutablePath(): string | null {
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const playnitePath = path.join(localAppData, 'Playnite', 'Playnite.DesktopApp.exe')
    if (fs.existsSync(playnitePath)) return playnitePath
  }
  
  const appData = process.env.APPDATA
  if (appData) {
    const playnitePath = path.join(appData, 'Playnite', 'Playnite.DesktopApp.exe')
    if (fs.existsSync(playnitePath)) return playnitePath
  }

  return null
}

export function launchGame(gameId: string): void {
  const exePath = getPlayniteExecutablePath()
  if (!exePath) {
    console.error('Playnite executable not found.')
    return
  }

  require('fs').appendFileSync('C:\\coding-projects\\GameShelf3D\\launch-log.txt', `Executing: ${exePath} --start ${gameId}\n`)
  require('child_process').execFile(exePath, ['--start', gameId], (error, stdout, stderr) => {
    if (error) {
      console.error(`Failed to launch game ${gameId}:`, error)
      require('fs').appendFileSync('C:\\coding-projects\\GameShelf3D\\launch-log.txt', `Error: ${error.message}\nStderr: ${stderr}\n`)
    } else {
      require('fs').appendFileSync('C:\\coding-projects\\GameShelf3D\\launch-log.txt', `Success! Stdout: ${stdout}\n`)
    }
  })
}

export function showGame(gameId: string): void {
  const exePath = getPlayniteExecutablePath()
  if (!exePath) {
    console.error('Playnite executable not found.')
    return
  }

  // Pass the URI command directly to the Playnite executable to ensure it processes the navigation
  require('child_process').execFile(exePath, ['--uridata', `playnite://playnite/showgame/${gameId}`], (error) => {
    if (error) {
      console.error(`Failed to show game ${gameId}:`, error)
    }
  })
}

export async function suggestGame(): Promise<any> {
  return new Promise((resolve, reject) => {
    const exportPath = path.join(__dirname, '../../playnite_export.json')
    const exePath = path.join(__dirname, '../../sparsi-workflows/suggest-game/suggestgame.exe')
    
    if (!fs.existsSync(exportPath)) {
      return reject(new Error('playnite_export.json not found'))
    }
    
    if (!fs.existsSync(exePath)) {
      return reject(new Error('suggestgame.exe not found. Please compile it first.'))
    }

    require('child_process').execFile(exePath, ['-library_path', exportPath], (error, stdout, stderr) => {
      if (error) {
        console.error('Suggest Game Error:', stderr || error.message)
        return reject(new Error(stderr || error.message))
      }
      try {
        const result = JSON.parse(stdout)
        resolve(result)
      } catch (parseErr) {
        console.error('Suggest Game Parse Error:', parseErr, stdout)
        reject(new Error('Failed to parse suggestion output'))
      }
    })
  })
}

