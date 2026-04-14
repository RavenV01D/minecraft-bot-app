# Minecraft Bot App

Desktop Electron controller for a `mineflayer` Minecraft bot. The app gives you a native window with:

- server connection controls
- a live first-person viewer powered by `prismarine-viewer`
- keyboard and mouse movement/action controls
- in-app chat
- simple automation toggles for mining, PvP, and following a player
- macro recording and replay

## Stack

- Electron for the desktop shell
- Mineflayer for bot control
- `mineflayer-pathfinder` for navigation and following
- `mineflayer-pvp` for combat
- `mineflayer-collectblock` for auto-mining
- `mineflayer-auto-eat` for food management
- `prismarine-viewer` for the embedded 3D view

## Project Structure

```text
.
├── index.html     # App UI markup
├── main.js        # Electron main process + Minecraft bot logic
├── preload.js     # Safe IPC bridge exposed as window.electronAPI
├── renderer.js    # Frontend event handling and UI state
├── styles.css     # Desktop UI styling
└── package.json   # Scripts, dependencies, electron-builder config
```

## How It Works

The app is split into three layers:

1. `main.js`
   Creates the Electron window, connects the bot, loads Mineflayer plugins, starts the Prismarine viewer, and listens for IPC commands from the renderer.
2. `preload.js`
   Exposes a narrow API to the browser window using Electron's `contextBridge`.
3. `renderer.js`
   Handles form submission, movement keys, mouse look, chat, automation toggles, and macro recording.

Connection flow:

1. Enter the Minecraft server host, port, username, and optional version.
2. The renderer calls `window.electronAPI.connectBot(...)`.
3. The main process creates a Mineflayer bot and loads plugins.
4. On spawn, the app starts the local viewer and begins streaming bot position/state updates to the UI.

## Requirements

- Node.js 18+ recommended
- npm 9+ recommended
- macOS is the primary target in the current packaging config

Note:

- The app currently uses `auth: "offline"` when connecting the bot, so it is aimed at offline-mode or compatible servers.
- Packaging is configured in `package.json` for macOS and Windows, but the project currently appears to be developed mainly for macOS.

## Install

```bash
npm install
```

If dependency installation fails, check:

- your Node.js version
- whether you are using an LTS Node release supported by Electron native dependencies

## Run In Development

```bash
npm start
```

To open Electron DevTools:

```bash
npm run dev
```

## Build The App

Create a macOS app package:

```bash
npm run build
```

Clean production-style build:

```bash
npm run build:clean
```

Build output is expected under `dist/`.

## Controls

### Movement

- `W` or `Up Arrow`: move forward
- `S` or `Down Arrow`: move backward
- `A` or `Left Arrow`: strafe left
- `D` or `Right Arrow`: strafe right
- `Space`: jump
- `Shift`: sneak

### Actions

- Left click: attack or dig
- Right click: use/interact
- `Q`: drop selected item
- `F`: swap hands
- `E`: use item

### Automation

- Auto Mine: repeatedly searches for a named block and collects it
- Auto PvP: attacks nearby players
- Follow Player: pathfinds toward a named player

### Macros

- Record gameplay inputs
- Save named macros and persist them between app launches
- Run once or loop until stopped

## Known Issues

- Looping macros need careful testing against server lag, because replay timing is still time-based rather than state-based.
- Unsigned macOS builds may show Gatekeeper warnings on first launch.

## Troubleshooting

If the bot connects but the viewer stays blank:

- make sure the bot has spawned fully
- check whether port `3001` is already in use
- run with `npm run dev` and inspect the Electron console

If the app fails during packaging:

- verify all declared files exist
- ensure Electron dependencies are installed locally
- use an LTS Node release if native Electron dependencies fail to rebuild

## License

MIT
