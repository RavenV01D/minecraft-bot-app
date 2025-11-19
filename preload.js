const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Connection
  connectBot: (config) => ipcRenderer.invoke('connect-bot', config),
  disconnectBot: () => ipcRenderer.send('disconnect-bot'),
  
  // Controls
  setControlState: (action, state) => ipcRenderer.send('control-state', { action, state }),
  lookAt: (yaw, pitch) => ipcRenderer.send('look-at', { yaw, pitch }),
  performAction: (action) => ipcRenderer.send('bot-action', action),
  
  // Chat
  sendChat: (message) => ipcRenderer.send('send-chat', message),
  
  // Automation
  toggleAutoMine: (enabled, blockName) => ipcRenderer.send('toggle-auto-mine', { enabled, blockName }),
  togglePvP: (enabled) => ipcRenderer.send('toggle-pvp', enabled),
  followPlayer: (enabled, username) => ipcRenderer.send('follow-player', { enabled, username }),
  
  // Macros
  saveMacro: (name, actions) => ipcRenderer.send('save-macro', { name, actions }),
  runMacro: (name, repeat) => ipcRenderer.send('run-macro', { name, repeat }),
  stopMacro: (name) => ipcRenderer.send('stop-macro', name),
  getMacros: () => ipcRenderer.invoke('get-macros'),
  
  // Event listeners
  onBotReady: (callback) => ipcRenderer.on('bot-ready', (event, data) => callback(data)),
  onBotPosition: (callback) => ipcRenderer.on('bot-position', (event, data) => callback(data)),
  onBotChat: (callback) => ipcRenderer.on('bot-chat', (event, data) => callback(data)),
  onBotError: (callback) => ipcRenderer.on('bot-error', (event, error) => callback(error)),
  onBotDisconnected: (callback) => ipcRenderer.on('bot-disconnected', () => callback()),
  onAutomationLog: (callback) => ipcRenderer.on('automation-log', (event, message) => callback(message)),
  onMacroSaved: (callback) => ipcRenderer.on('macro-saved', (event, data) => callback(data))
});
