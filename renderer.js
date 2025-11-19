let isConnected = false;
let currentYaw = 0;
let currentPitch = 0;
let isRecording = false;
let recordedActions = [];
let recordStartTime = 0;

// Key mappings for movement
const keyMappings = {
  'w': 'forward',
  'arrowup': 'forward',
  's': 'back',
  'arrowdown': 'back',
  'a': 'left',
  'arrowleft': 'left',
  'd': 'right',
  'arrowright': 'right',
  ' ': 'jump',
  'shift': 'sneak'
};

// Active keys tracking
const activeKeys = new Set();

// DOM Elements
const connectForm = document.getElementById('connect-form');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const statusDiv = document.getElementById('status');
const viewer = document.getElementById('viewer');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const autoMineToggle = document.getElementById('auto-mine-toggle');
const mineBlockInput = document.getElementById('mine-block');
const pvpToggle = document.getElementById('pvp-toggle');
const followToggle = document.getElementById('follow-toggle');
const followUsernameInput = document.getElementById('follow-username');
const automationLog = document.getElementById('automation-log');
const recordMacroBtn = document.getElementById('record-macro-btn');
const stopRecordBtn = document.getElementById('stop-record-btn');
const saveMacroBtn = document.getElementById('save-macro-btn');
const macroNameInput = document.getElementById('macro-name');
const macrosDiv = document.getElementById('macros');
const recordingIndicator = document.getElementById('recording-indicator');

// Connection
connectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const config = {
    host: document.getElementById('host').value,
    port: parseInt(document.getElementById('port').value) || 25565,
    username: document.getElementById('username').value,
    version: document.getElementById('version').value || undefined
  };

  connectBtn.disabled = true;
  statusDiv.textContent = 'Connecting...';
  statusDiv.style.color = '#ff9500';

  const result = await window.electronAPI.connectBot(config);
  
  if (result.success) {
    statusDiv.textContent = 'Connecting to server...';
  } else {
    statusDiv.textContent = `Error: ${result.error}`;
    statusDiv.style.color = '#ff3b30';
    connectBtn.disabled = false;
  }
});

disconnectBtn.addEventListener('click', () => {
  window.electronAPI.disconnectBot();
});

// Bot event listeners
window.electronAPI.onBotReady((data) => {
  isConnected = true;
  connectBtn.disabled = true;
  disconnectBtn.disabled = false;
  statusDiv.textContent = `Connected as ${data.username} (${data.version})`;
  statusDiv.style.color = '#34c759';
  
  viewer.src = `http://localhost:${data.viewerPort}`;
});

window.electronAPI.onBotPosition((data) => {
  document.getElementById('pos-xyz').textContent = `X: ${data.x} Y: ${data.y} Z: ${data.z}`;
  document.getElementById('pos-rotation').textContent = `Yaw: ${data.yaw}° Pitch: ${data.pitch}°`;
  document.getElementById('health').textContent = `❤️ ${data.health}`;
  document.getElementById('food').textContent = `🍖 ${data.food}`;
  
  currentYaw = parseFloat(data.yaw);
  currentPitch = parseFloat(data.pitch);
});

window.electronAPI.onBotChat((data) => {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  messageDiv.innerHTML = `<span class="chat-username">${data.username}:</span> ${data.message}`;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

window.electronAPI.onBotError((error) => {
  statusDiv.textContent = `Error: ${error}`;
  statusDiv.style.color = '#ff3b30';
  addAutomationLog(`Error: ${error}`, '#ff3b30');
});

window.electronAPI.onBotDisconnected(() => {
  isConnected = false;
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  statusDiv.textContent = 'Disconnected';
  statusDiv.style.color = '#b0b0b0';
  viewer.src = '';
  activeKeys.clear();
});

window.electronAPI.onAutomationLog((message) => {
  addAutomationLog(message);
});

window.electronAPI.onMacroSaved((data) => {
  addAutomationLog(`Macro "${data.name}" saved (${data.count} total)`);
  loadMacros();
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (!isConnected) return;
  
  // Ignore if typing in input
  if (e.target.tagName === 'INPUT') return;
  
  const key = e.key.toLowerCase();
  const action = keyMappings[key];
  
  if (action && !activeKeys.has(key)) {
    activeKeys.add(key);
    window.electronAPI.setControlState(action, true);
    
    if (isRecording) {
      recordedActions.push({
        type: 'control',
        control: action,
        duration: 0,
        timestamp: Date.now() - recordStartTime
      });
    }
  }
  
  // Quick actions
  if (key === 'q') {
    window.electronAPI.performAction('drop');
    if (isRecording) recordAction('drop');
  } else if (key === 'f') {
    window.electronAPI.performAction('swap');
    if (isRecording) recordAction('swap');
  } else if (key === 'e') {
    window.electronAPI.performAction('use');
    if (isRecording) recordAction('use');
  }
});

document.addEventListener('keyup', (e) => {
  if (!isConnected) return;
  
  const key = e.key.toLowerCase();
  const action = keyMappings[key];
  
  if (action && activeKeys.has(key)) {
    activeKeys.delete(key);
    window.electronAPI.setControlState(action, false);
    
    if (isRecording) {
      // Update duration of last recorded action
      const lastAction = recordedActions[recordedActions.length - 1];
      if (lastAction && lastAction.control === action) {
        lastAction.duration = Date.now() - recordStartTime - lastAction.timestamp;
      }
    }
  }
});

// Mouse controls on viewer
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

viewer.addEventListener('mousedown', (e) => {
  if (!isConnected) return;
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  
  // Left click = attack
  if (e.button === 0) {
    window.electronAPI.performAction('attack');
    if (isRecording) recordAction('attack');
  }
  // Right click = use
  else if (e.button === 2) {
    window.electronAPI.performAction('use');
    if (isRecording) recordAction('use');
  }
});

viewer.addEventListener('mousemove', (e) => {
  if (!isConnected || !isDragging) return;
  
  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;
  
  currentYaw += deltaX * 0.3;
  currentPitch = Math.max(-90, Math.min(90, currentPitch + deltaY * 0.3));
  
  window.electronAPI.lookAt(currentYaw, currentPitch);
  
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  
  if (isRecording && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
    recordedActions.push({
      type: 'look',
      yaw: currentYaw,
      pitch: currentPitch,
      timestamp: Date.now() - recordStartTime
    });
  }
});

viewer.addEventListener('mouseup', () => {
  isDragging = false;
});

viewer.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Action buttons
document.querySelectorAll('.action-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!isConnected) return;
    const action = btn.dataset.action;
    window.electronAPI.performAction(action);
    if (isRecording) recordAction(action);
  });
});

// Chat
sendChatBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  const message = chatInput.value.trim();
  if (message && isConnected) {
    window.electronAPI.sendChat(message);
    chatInput.value = '';
    
    if (isRecording) {
      recordedActions.push({
        type: 'chat',
        message: message,
        timestamp: Date.now() - recordStartTime
      });
    }
  }
}

// Automation
autoMineToggle.addEventListener('change', (e) => {
  const blockName = mineBlockInput.value.trim();
  if (e.target.checked && !blockName) {
    e.target.checked = false;
    addAutomationLog('Enter a block name first', '#ff9500');
    return;
  }
  window.electronAPI.toggleAutoMine(e.target.checked, blockName);
  addAutomationLog(`Auto-mining ${e.target.checked ? 'enabled' : 'disabled'}: ${blockName}`);
});

pvpToggle.addEventListener('change', (e) => {
  window.electronAPI.togglePvP(e.target.checked);
  addAutomationLog(`Auto-PvP ${e.target.checked ? 'enabled' : 'disabled'}`);
});

followToggle.addEventListener('change', (e) => {
  const username = followUsernameInput.value.trim();
  if (e.target.checked && !username) {
    e.target.checked = false;
    addAutomationLog('Enter a username first', '#ff9500');
    return;
  }
  window.electronAPI.followPlayer(e.target.checked, username);
  addAutomationLog(`Following ${e.target.checked ? 'enabled' : 'disabled'}: ${username}`);
});

function addAutomationLog(message, color = '#34c759') {
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.style.color = color;
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  automationLog.appendChild(logEntry);
  automationLog.scrollTop = automationLog.scrollHeight;
  
  // Keep only last 50 entries
  while (automationLog.children.length > 50) {
    automationLog.removeChild(automationLog.firstChild);
  }
}

// Macro system
recordMacroBtn.addEventListener('click', () => {
  if (!isConnected) return;
  
  isRecording = true;
  recordedActions = [];
  recordStartTime = Date.now();
  
  recordMacroBtn.disabled = true;
  recordMacroBtn.classList.add('recording');
  stopRecordBtn.disabled = false;
  recordingIndicator.classList.remove('hidden');
  
  addAutomationLog('Started recording macro', '#ff9500');
});

stopRecordBtn.addEventListener('click', () => {
  isRecording = false;
  
  recordMacroBtn.disabled = false;
  recordMacroBtn.classList.remove('recording');
  stopRecordBtn.disabled = true;
  saveMacroBtn.disabled = false;
  recordingIndicator.classList.add('hidden');
  
  addAutomationLog(`Stopped recording (${recordedActions.length} actions)`, '#ff9500');
});

saveMacroBtn.addEventListener('click', () => {
  const name = macroNameInput.value.trim();
  if (!name) {
    addAutomationLog('Enter a macro name', '#ff3b30');
    return;
  }
  
  if (recordedActions.length === 0) {
    addAutomationLog('No actions recorded', '#ff3b30');
    return;
  }
  
  window.electronAPI.saveMacro(name, recordedActions);
  macroNameInput.value = '';
  recordedActions = [];
  saveMacroBtn.disabled = true;
});

async function loadMacros() {
  const macros = await window.electronAPI.getMacros();
  macrosDiv.innerHTML = '';
  
  if (macros.length === 0) {
    macrosDiv.innerHTML = '<div style="color: #666; font-size: 11px; padding: 8px;">No saved macros</div>';
    return;
  }
  
  macros.forEach(name => {
    const item = document.createElement('div');
    item.className = 'macro-item';
    
    item.innerHTML = `
      <span>${name}</span>
      <div class="macro-controls">
        <button onclick="runMacro('${name}', false)">▶️ Run</button>
        <button onclick="runMacro('${name}', true)">🔁 Loop</button>
        <button onclick="stopMacro('${name}')">⏹ Stop</button>
      </div>
    `;
    
    macrosDiv.appendChild(item);
  });
}

function runMacro(name, repeat) {
  if (!isConnected) return;
  window.electronAPI.runMacro(name, repeat);
  addAutomationLog(`${repeat ? 'Looping' : 'Running'} macro: ${name}`);
}

function stopMacro(name) {
  window.electronAPI.stopMacro(name);
  addAutomationLog(`Stopped macro: ${name}`);
}

function recordAction(type) {
  recordedActions.push({
    type: type,
    timestamp: Date.now() - recordStartTime
  });
}

// Make functions global for inline onclick handlers
window.runMacro = runMacro;
window.stopMacro = stopMacro;

// Load macros on startup
loadMacros();
