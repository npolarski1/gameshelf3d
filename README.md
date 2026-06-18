# GameShelf3D

Browse, search, and launch your entire cross-platform game library from a beautiful, interactive 3D virtual shelf. 

Powered by **Electron**, **React Three Fiber**, and **Playnite**, GameShelf3D turns your desktop gaming library into a premium, immersive sci-fi experience.

## Features

- **Immersive 3D Environment**: Scroll through your game library on an interactive 3D shelf, complete with cinematic spotlighting and a deep-space starry background.
- **Playnite Integration**: Seamlessly imports your game titles, cover art, and installation status directly from your Playnite library.
- **One-Click Launch**: Instantly boot up any installed game directly from the 3D shelf with a single click.
- **Real-Time Search**: Quickly find the game you want using the sleek, glassmorphic floating search bar. 
- **Interactive UI**: Enjoy smooth micro-animations, dynamic Z-axis hover pop-outs, and a futuristic sci-fi aesthetic powered by the Rajdhani font.

---

## Quickstart Guide

### Prerequisites
- **Windows OS** (required for Playnite integration)
- **Node.js** (v18 or higher recommended)
- **Playnite** desktop application installed

### 1. Export Your Playnite Library
GameShelf3D reads your game data from a JSON export. 
1. Open Playnite.
2. Export your game library data as a JSON file.
3. Save the file as `playnite_export.json` directly into the root directory of this project (`GameShelf3D/playnite_export.json`).

*Note: Ensure your games have cover art assigned in Playnite for the best visual experience on the shelf!*

### 2. Install Dependencies
Open your terminal in the project directory and run:
```bash
npm install
```

### 3. Run the App
Launch the development server and the Electron application:
```bash
npm run dev
```

### 4. Build for Production
To package the app into a standalone Windows executable:
```bash
npm run build:win
```
The compiled `.exe` will be available in the `dist` folder.

---

## Tech Stack
- **Frontend**: React, React Three Fiber, Drei (Three.js)
- **Desktop Framework**: Electron (via electron-vite)
- **Styling**: Vanilla CSS & Inline styles with Glassmorphism
- **IPC Backend**: Node.js `child_process`
