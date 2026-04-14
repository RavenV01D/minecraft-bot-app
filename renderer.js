let isConnected = false;
let currentYaw = 0;
let currentPitch = 0;
let isRecording = false;
let recordedActions = [];
let recordStartTime = 0;
let immersiveMode = false;
let inventoryMode = false;
let isDragging = false;
let pointerLocked = false;
let lastMouseX = 0;
let lastMouseY = 0;
let selectedInventorySlot = null;
let highlightedSlot = 36;
let inventorySnapshot = createEmptyInventorySnapshot();
let activeDashboardInteraction = null;

const DASHBOARD_STORAGE_KEY = 'minecraft-bot-dashboard-layout-v1';
const SNAP_SIZE = 16;
const DASHBOARD_PADDING = 12;
const MIN_CARD_WIDTH = 260;
const MIN_CARD_HEIGHT = 170;
const DEFAULT_CARD_LAYOUTS = {
  connection: { x: 16, y: 16, width: 620, height: 154, minimized: false },
  control: { x: 16, y: 186, width: 760, height: 640, minimized: false },
  inventory: { x: 792, y: 16, width: 600, height: 500, minimized: false },
  chat: { x: 792, y: 532, width: 360, height: 294, minimized: false },
  automation: { x: 1168, y: 532, width: 360, height: 294, minimized: false },
  macros: { x: 1408, y: 16, width: 320, height: 500, minimized: false }
};

const keyMappings = {
  w: 'forward',
  arrowup: 'forward',
  s: 'back',
  arrowdown: 'back',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
  ' ': 'jump',
  shift: 'sneak'
};

const inventoryRows = [
  [5, 6, 7, 8, 45],
  [9, 10, 11, 12, 13, 14, 15, 16, 17],
  [18, 19, 20, 21, 22, 23, 24, 25, 26],
  [27, 28, 29, 30, 31, 32, 33, 34, 35],
  [36, 37, 38, 39, 40, 41, 42, 43, 44]
];

const activeKeys = new Set();

const body = document.body;
const dashboard = document.getElementById('dashboard');
const dashboardCards = Array.from(document.querySelectorAll('.dashboard-card'));
const connectForm = document.getElementById('connect-form');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const statusDiv = document.getElementById('status');
const viewer = document.getElementById('viewer');
const viewerInputLayer = document.getElementById('viewer-input-layer');
const immersiveToggleBtn = document.getElementById('immersive-toggle-btn');
const inventoryToggleBtn = document.getElementById('inventory-toggle-btn');
const enterHotkeyModeBtn = document.getElementById('enter-hotkey-mode-btn');
const openInventoryModeBtn = document.getElementById('open-inventory-mode-btn');
const modeLabel = document.getElementById('mode-label');
const modeSubtitle = document.getElementById('mode-subtitle');
const inventoryOverlay = document.getElementById('inventory-overlay');
const inventoryCloseBtn = document.getElementById('inventory-close-btn');
const inventoryModeStatus = document.getElementById('inventory-mode-status');
const inventoryPageStatus = document.getElementById('inventory-page-status');
const inventoryHeldItem = document.getElementById('inventory-held-item');
const inventoryCursorItem = document.getElementById('inventory-cursor-item');
const inventoryPageHeldItem = document.getElementById('inventory-page-held-item');
const inventoryPageCursorItem = document.getElementById('inventory-page-cursor-item');
const armorSlots = document.getElementById('armor-slots');
const offhandSlot = document.getElementById('offhand-slot');
const mainInventory = document.getElementById('main-inventory');
const hotbarInventory = document.getElementById('hotbar-inventory');
const pageArmorSlots = document.getElementById('page-armor-slots');
const pageOffhandSlot = document.getElementById('page-offhand-slot');
const pageMainInventory = document.getElementById('page-main-inventory');
const pageHotbarInventory = document.getElementById('page-hotbar-inventory');
const inventoryEquipBtn = document.getElementById('inventory-equip-btn');
const inventoryDropBtn = document.getElementById('inventory-drop-btn');
const inventoryClearSelectionBtn = document.getElementById('inventory-clear-selection-btn');
const inventoryPageEquipBtn = document.getElementById('inventory-page-equip-btn');
const inventoryPageDropBtn = document.getElementById('inventory-page-drop-btn');
const inventoryPageClearSelectionBtn = document.getElementById('inventory-page-clear-selection-btn');
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

connectForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const config = {
    host: document.getElementById('host').value,
    port: parseInt(document.getElementById('port').value, 10) || 25565,
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

initializeDashboardCards();

disconnectBtn.addEventListener('click', () => {
  window.electronAPI.disconnectBot();
});

immersiveToggleBtn.addEventListener('click', () => toggleImmersiveMode());
enterHotkeyModeBtn.addEventListener('click', () => toggleImmersiveMode(true));
inventoryToggleBtn.addEventListener('click', () => toggleInventoryMode());
openInventoryModeBtn.addEventListener('click', () => toggleInventoryMode(true));
inventoryCloseBtn.addEventListener('click', () => setInventoryMode(false));

inventoryEquipBtn.addEventListener('click', async () => {
  const slot = selectedInventorySlot ?? highlightedSlot;
  if (slot == null || !getSlotData(slot)?.item) return;
  await runInventoryAction({ type: 'equip-slot', slot }, 'Equipped selected item');
  selectedInventorySlot = null;
  renderInventory();
});

inventoryDropBtn.addEventListener('click', async () => {
  const slot = selectedInventorySlot ?? highlightedSlot;
  if (slot == null || !getSlotData(slot)?.item) return;
  await runInventoryAction({ type: 'toss-slot', slot }, 'Dropped selected stack');
  if (selectedInventorySlot === slot) selectedInventorySlot = null;
  renderInventory();
});

inventoryClearSelectionBtn.addEventListener('click', () => {
  selectedInventorySlot = null;
  setInventoryStatus('Selection cleared');
  renderInventory();
});

inventoryPageEquipBtn.addEventListener('click', async () => {
  const slot = selectedInventorySlot ?? highlightedSlot;
  if (slot == null || !getSlotData(slot)?.item) return;
  await runInventoryAction({ type: 'equip-slot', slot }, 'Equipped selected item');
  selectedInventorySlot = null;
  renderInventory();
});

inventoryPageDropBtn.addEventListener('click', async () => {
  const slot = selectedInventorySlot ?? highlightedSlot;
  if (slot == null || !getSlotData(slot)?.item) return;
  await runInventoryAction({ type: 'toss-slot', slot }, 'Dropped selected stack');
  if (selectedInventorySlot === slot) selectedInventorySlot = null;
  renderInventory();
});

inventoryPageClearSelectionBtn.addEventListener('click', () => {
  selectedInventorySlot = null;
  setInventoryStatus('Selection cleared');
  renderInventory();
});

window.electronAPI.onBotReady(async (data) => {
  isConnected = true;
  connectBtn.disabled = true;
  disconnectBtn.disabled = false;
  statusDiv.textContent = `Connected as ${data.username} (${data.version})`;
  statusDiv.style.color = '#34c759';

  viewer.src = `http://localhost:${data.viewerPort}`;
  const inventory = await window.electronAPI.getInventory();
  updateInventorySnapshot(inventory);
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
  updateInventorySnapshot(createEmptyInventorySnapshot());
  releaseAllControls();
  setInventoryMode(false);
  setImmersiveMode(false);
});

window.electronAPI.onAutomationLog((message) => {
  addAutomationLog(message);
});

window.electronAPI.onMacroSaved((data) => {
  addAutomationLog(`Macro "${data.name}" saved (${data.count} total)`);
  loadMacros();
});

window.electronAPI.onInventoryUpdate((data) => {
  updateInventorySnapshot(data);
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === viewerInputLayer;
  body.classList.toggle('pointer-locked', pointerLocked);
  updateModeBadge();
});

document.addEventListener('mousemove', (event) => {
  handleDashboardInteraction(event);
});

document.addEventListener('mouseup', () => {
  stopDashboardInteraction();
});

document.addEventListener('keydown', async (e) => {
  const key = e.key.toLowerCase();
  const editableTarget = isEditableTarget(e.target);

  if (key === 'f1') {
    e.preventDefault();
    if (isConnected) toggleImmersiveMode();
    return;
  }

  if (!isConnected) return;

  if ((key === 'i' && !editableTarget) || (inventoryMode && key === 'i')) {
    e.preventDefault();
    toggleInventoryMode();
    return;
  }

  if (key === 'escape') {
    e.preventDefault();
    if (inventoryMode) {
      setInventoryMode(false);
      return;
    }
    if (pointerLocked) {
      document.exitPointerLock();
      return;
    }
    if (immersiveMode) {
      setImmersiveMode(false);
    }
    return;
  }

  if (inventoryMode) {
    if (editableTarget) return;
    e.preventDefault();
    await handleInventoryKeydown(key);
    return;
  }

  if (editableTarget && !immersiveMode) return;

  if (key >= '1' && key <= '9' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const hotbarIndex = Number(key) - 1;
    await selectHotbarSlot(hotbarIndex);
    return;
  }

  const action = keyMappings[key];
  if (action && !activeKeys.has(key)) {
    e.preventDefault();
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
    return;
  }

  if (key === 'q') {
    e.preventDefault();
    window.electronAPI.performAction('drop');
    if (isRecording) recordAction('drop');
  } else if (key === 'f') {
    e.preventDefault();
    window.electronAPI.performAction('swap');
    if (isRecording) recordAction('swap');
  } else if (key === 'e') {
    e.preventDefault();
    window.electronAPI.performAction('use');
    if (isRecording) recordAction('use');
  }
});

document.addEventListener('keyup', (e) => {
  if (!isConnected || inventoryMode) return;
  if (isEditableTarget(e.target) && !immersiveMode) return;

  const key = e.key.toLowerCase();
  const action = keyMappings[key];

  if (action && activeKeys.has(key)) {
    e.preventDefault();
    activeKeys.delete(key);
    window.electronAPI.setControlState(action, false);

    if (isRecording) {
      const lastAction = recordedActions[recordedActions.length - 1];
      if (lastAction && lastAction.control === action) {
        lastAction.duration = Date.now() - recordStartTime - lastAction.timestamp;
      }
    }
  }
});

viewerInputLayer.addEventListener('mousedown', (e) => {
  if (!isConnected) return;

  e.preventDefault();
  viewerInputLayer.focus();

  if (inventoryMode) return;

  if (immersiveMode && viewerInputLayer.requestPointerLock && !pointerLocked) {
    viewerInputLayer.requestPointerLock();
  }

  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (e.button === 0) {
    window.electronAPI.performAction('attack');
    if (isRecording) recordAction('attack');
  } else if (e.button === 2) {
    window.electronAPI.performAction('use');
    if (isRecording) recordAction('use');
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isConnected || inventoryMode) return;

  if (pointerLocked) {
    rotateView(e.movementX, e.movementY);
    return;
  }

  if (!isDragging) return;

  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;
  rotateView(deltaX, deltaY);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

viewerInputLayer.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

document.querySelectorAll('.action-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!isConnected) return;
    const action = btn.dataset.action;
    window.electronAPI.performAction(action);
    if (isRecording) recordAction(action);
  });
});

sendChatBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

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

function createEmptyInventorySnapshot() {
  return {
    connected: false,
    quickBarSlot: 0,
    selectedItem: null,
    heldItem: null,
    armor: [],
    offhand: null,
    main: [],
    hotbar: []
  };
}

function isEditableTarget(target) {
  return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

function sendChat() {
  const message = chatInput.value.trim();
  if (message && isConnected) {
    window.electronAPI.sendChat(message);
    chatInput.value = '';

    if (isRecording) {
      recordedActions.push({
        type: 'chat',
        message,
        timestamp: Date.now() - recordStartTime
      });
    }
  }
}

function rotateView(deltaX, deltaY) {
  currentYaw += deltaX * 0.22;
  currentPitch = Math.max(-90, Math.min(90, currentPitch + deltaY * 0.22));
  window.electronAPI.lookAt(currentYaw, currentPitch);

  if (isRecording && (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1)) {
    recordedActions.push({
      type: 'look',
      yaw: currentYaw,
      pitch: currentPitch,
      timestamp: Date.now() - recordStartTime
    });
  }
}

function toggleImmersiveMode(forceOn = null) {
  if (!isConnected) return;
  setImmersiveMode(forceOn === null ? !immersiveMode : forceOn);
}

function setImmersiveMode(enabled) {
  immersiveMode = enabled;
  body.classList.toggle('immersive-mode', enabled);

  if (!enabled) {
    isDragging = false;
    if (pointerLocked && document.exitPointerLock) document.exitPointerLock();
  } else {
    viewerInputLayer.focus();
  }

  updateModeBadge();
}

function toggleInventoryMode(forceOn = null) {
  if (!isConnected) return;
  setInventoryMode(forceOn === null ? !inventoryMode : forceOn);
}

function setInventoryMode(enabled) {
  inventoryMode = enabled;
  inventoryOverlay.classList.toggle('hidden', !enabled);

  if (enabled) {
    if (pointerLocked && document.exitPointerLock) document.exitPointerLock();
    releaseAllControls();
    if (!highlightedSlot || !getSlotData(highlightedSlot)) {
      highlightedSlot = 36 + inventorySnapshot.quickBarSlot;
    }
    setInventoryStatus('Click a slot to select it, then click another slot to move.');
    renderInventory();
    viewerInputLayer.focus();
  } else {
    selectedInventorySlot = null;
  }

  updateModeBadge();
}

function updateModeBadge() {
  const hotkeyLabel = immersiveMode ? 'Exit Hotkey Mode' : 'Hotkey Mode';
  immersiveToggleBtn.textContent = hotkeyLabel;
  enterHotkeyModeBtn.textContent = immersiveMode ? 'Exit Hotkey Mode (F1)' : 'Enter Hotkey Mode (F1)';
  inventoryToggleBtn.textContent = inventoryMode ? 'Close Inventory' : 'Inventory';
  openInventoryModeBtn.textContent = inventoryMode ? 'Close Inventory (I)' : 'Inventory Mode (I)';

  if (inventoryMode) {
    modeLabel.textContent = 'Inventory Mode';
    modeSubtitle.textContent = 'Arrow keys or WASD navigate, Enter moves, I closes';
  } else if (immersiveMode && pointerLocked) {
    modeLabel.textContent = 'Hotkey Mode Active';
    modeSubtitle.textContent = 'Mouse locked to viewer input layer';
  } else if (immersiveMode) {
    modeLabel.textContent = 'Hotkey Mode';
    modeSubtitle.textContent = 'Click the viewer to lock mouse control';
  } else {
    modeLabel.textContent = 'Standard Mode';
    modeSubtitle.textContent = 'F1 toggles hotkey mode';
  }
}

function releaseAllControls() {
  activeKeys.forEach((key) => {
    const action = keyMappings[key];
    if (action) window.electronAPI.setControlState(action, false);
  });
  activeKeys.clear();
}

function updateInventorySnapshot(snapshot) {
  inventorySnapshot = snapshot || createEmptyInventorySnapshot();
  if (inventorySnapshot.connected) {
    const defaultSlot = 36 + inventorySnapshot.quickBarSlot;
    if (!getSlotData(highlightedSlot)) highlightedSlot = defaultSlot;
  } else {
    highlightedSlot = 36;
    selectedInventorySlot = null;
  }
  renderInventory();
}

function getAllSlotData() {
  return [
    ...(inventorySnapshot.armor || []),
    ...(inventorySnapshot.offhand ? [inventorySnapshot.offhand] : []),
    ...(inventorySnapshot.main || []),
    ...(inventorySnapshot.hotbar || [])
  ];
}

function getSlotData(slot) {
  return getAllSlotData().find((entry) => entry.slot === slot) || null;
}

function describeItem(item) {
  if (!item) return 'Empty';
  return `${item.displayName} x${item.count}`;
}

function setInventoryStatus(message) {
  inventoryModeStatus.textContent = message;
  inventoryPageStatus.textContent = message;
}

function renderInventory() {
  inventoryHeldItem.textContent = `Hand: ${describeItem(inventorySnapshot.heldItem)}`;
  inventoryCursorItem.textContent = `Cursor: ${describeItem(inventorySnapshot.selectedItem)}`;
  inventoryPageHeldItem.textContent = `Hand: ${describeItem(inventorySnapshot.heldItem)}`;
  inventoryPageCursorItem.textContent = `Cursor: ${describeItem(inventorySnapshot.selectedItem)}`;

  const armor = inventorySnapshot.armor || [];
  const offhand = inventorySnapshot.offhand ? [inventorySnapshot.offhand] : [];
  const main = inventorySnapshot.main || [];
  const hotbar = inventorySnapshot.hotbar || [];

  renderSlotGroup(armorSlots, armor);
  renderSlotGroup(offhandSlot, offhand);
  renderSlotGroup(mainInventory, main);
  renderSlotGroup(hotbarInventory, hotbar);
  renderSlotGroup(pageArmorSlots, armor);
  renderSlotGroup(pageOffhandSlot, offhand);
  renderSlotGroup(pageMainInventory, main);
  renderSlotGroup(pageHotbarInventory, hotbar);
}

function renderSlotGroup(container, entries) {
  container.innerHTML = '';

  entries.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inventory-slot';
    if (!entry.item) button.classList.add('empty');
    if (entry.slot === highlightedSlot) button.classList.add('highlighted');
    if (entry.slot === selectedInventorySlot) button.classList.add('selected');
    if (entry.slot >= 36 && entry.slot <= 44 && entry.slot === 36 + inventorySnapshot.quickBarSlot) {
      button.classList.add('quickbar-active');
    }

    const itemName = entry.item ? entry.item.displayName : 'Empty';
    const meta = entry.item ? `Count ${entry.item.count}` : `Slot ${entry.slot}`;
    button.innerHTML = `
      <span class="inventory-slot-label">${entry.label || `Slot ${entry.slot}`}</span>
      <span class="inventory-slot-name">${itemName}</span>
      <span class="inventory-slot-meta">${meta}</span>
    `;

    button.addEventListener('click', async () => {
      highlightedSlot = entry.slot;
      await handleInventorySlotInteraction(entry.slot);
    });

    container.appendChild(button);
  });
}

async function handleInventorySlotInteraction(slot) {
  const slotData = getSlotData(slot);
  const hasItem = Boolean(slotData && slotData.item);

  if (selectedInventorySlot == null) {
    if (!hasItem) {
      setInventoryStatus(`Slot ${slot} is empty`);
      renderInventory();
      return;
    }

    selectedInventorySlot = slot;
    setInventoryStatus(`Selected ${describeItem(slotData.item)} from slot ${slot}`);
    renderInventory();
    return;
  }

  if (selectedInventorySlot === slot) {
    selectedInventorySlot = null;
    if (slot >= 36 && slot <= 44) {
      await selectHotbarSlot(slot - 36);
      setInventoryStatus(`Selected hotbar slot ${slot - 35}`);
    } else {
      setInventoryStatus('Selection cleared');
    }
    renderInventory();
    return;
  }

  await runInventoryAction(
    { type: 'move-slot', slot: selectedInventorySlot, targetSlot: slot },
    `Moved stack from slot ${selectedInventorySlot} to slot ${slot}`
  );
  selectedInventorySlot = null;
  highlightedSlot = slot;
  renderInventory();
}

async function handleInventoryKeydown(key) {
  if (key === 'arrowup' || key === 'w') {
    moveInventoryHighlight(-1, 0);
    return;
  }
  if (key === 'arrowdown' || key === 's') {
    moveInventoryHighlight(1, 0);
    return;
  }
  if (key === 'arrowleft' || key === 'a') {
    moveInventoryHighlight(0, -1);
    return;
  }
  if (key === 'arrowright' || key === 'd') {
    moveInventoryHighlight(0, 1);
    return;
  }
  if (key === 'enter' || key === ' ') {
    await handleInventorySlotInteraction(highlightedSlot);
    return;
  }
  if (key === 'q') {
    const slot = selectedInventorySlot ?? highlightedSlot;
    if (getSlotData(slot)?.item) {
      await runInventoryAction({ type: 'toss-slot', slot }, `Dropped stack from slot ${slot}`);
      if (selectedInventorySlot === slot) selectedInventorySlot = null;
      renderInventory();
    }
    return;
  }
  if (key >= '1' && key <= '9') {
    const hotbarIndex = Number(key) - 1;
    const sourceSlot = selectedInventorySlot ?? highlightedSlot;
    if (sourceSlot != null && getSlotData(sourceSlot)?.item && sourceSlot !== 36 + hotbarIndex) {
      await runInventoryAction(
        { type: 'move-slot', slot: sourceSlot, targetSlot: 36 + hotbarIndex },
        `Moved stack to hotbar slot ${hotbarIndex + 1}`
      );
      highlightedSlot = 36 + hotbarIndex;
      selectedInventorySlot = null;
      renderInventory();
    } else {
      await selectHotbarSlot(hotbarIndex);
    }
  }
}

function moveInventoryHighlight(rowDelta, colDelta) {
  const position = findInventoryPosition(highlightedSlot);
  if (!position) return;

  let row = Math.max(0, Math.min(inventoryRows.length - 1, position.row + rowDelta));
  let col = Math.max(0, position.col + colDelta);
  col = Math.min(col, inventoryRows[row].length - 1);
  highlightedSlot = inventoryRows[row][col];
  renderInventory();
}

function findInventoryPosition(slot) {
  for (let row = 0; row < inventoryRows.length; row += 1) {
    const col = inventoryRows[row].indexOf(slot);
    if (col !== -1) {
      return { row, col };
    }
  }
  return null;
}

async function selectHotbarSlot(hotbarIndex) {
  const result = await window.electronAPI.inventoryAction({ type: 'select-hotbar', hotbarIndex });
  if (result.inventory) updateInventorySnapshot(result.inventory);
  if (!result.success) {
    addAutomationLog(`Inventory error: ${result.error}`, '#ff3b30');
  } else {
    highlightedSlot = 36 + hotbarIndex;
    addAutomationLog(`Selected hotbar slot ${hotbarIndex + 1}`);
  }
}

async function runInventoryAction(payload, successMessage) {
  const result = await window.electronAPI.inventoryAction(payload);
  if (result.inventory) updateInventorySnapshot(result.inventory);

  if (!result.success) {
    setInventoryStatus(result.error);
    addAutomationLog(`Inventory error: ${result.error}`, '#ff3b30');
    return false;
  }

  if (successMessage) {
    setInventoryStatus(successMessage);
    addAutomationLog(successMessage);
  }
  return true;
}

function addAutomationLog(message, color = '#34c759') {
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.style.color = color;
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  automationLog.appendChild(logEntry);
  automationLog.scrollTop = automationLog.scrollHeight;

  while (automationLog.children.length > 50) {
    automationLog.removeChild(automationLog.firstChild);
  }
}

async function loadMacros() {
  const macros = await window.electronAPI.getMacros();
  macrosDiv.innerHTML = '';

  if (macros.length === 0) {
    macrosDiv.innerHTML = '<div style="color: #666; font-size: 11px; padding: 8px;">No saved macros</div>';
    return;
  }

  macros.forEach((name) => {
    const item = document.createElement('div');
    item.className = 'macro-item';

    item.innerHTML = `
      <span>${name}</span>
      <div class="macro-controls">
        <button onclick="runMacro('${name}', false)">Run</button>
        <button onclick="runMacro('${name}', true)">Loop</button>
        <button onclick="stopMacro('${name}')">Stop</button>
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
    type,
    timestamp: Date.now() - recordStartTime
  });
}

window.runMacro = runMacro;
window.stopMacro = stopMacro;

updateModeBadge();
renderInventory();
loadMacros();

function initializeDashboardCards() {
  const savedLayout = loadDashboardLayout();

  dashboardCards.forEach((card) => {
    const cardId = card.dataset.card;
    const layout = savedLayout[cardId] || DEFAULT_CARD_LAYOUTS[cardId];
    applyCardLayout(card, layout);

    const header = card.querySelector('.card-header');
    const minimizeButton = card.querySelector('[data-card-minimize]');
    const resizeHandle = card.querySelector('.card-resize-handle');

    if (header) {
      header.addEventListener('mousedown', (event) => {
        if (event.target.closest('button')) return;
        startDashboardDrag(card, event);
      });
    }

    if (minimizeButton) {
      minimizeButton.addEventListener('click', () => {
        toggleCardMinimized(card);
      });
    }

    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', (event) => {
        startDashboardResize(card, event);
      });
    }
  });
}

function loadDashboardLayout() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveDashboardLayout() {
  const layout = {};
  dashboardCards.forEach((card) => {
    layout[card.dataset.card] = {
      x: Number(card.dataset.x || 0),
      y: Number(card.dataset.y || 0),
      width: Number(card.dataset.width || card.offsetWidth),
      height: Number(card.dataset.height || card.offsetHeight),
      minimized: card.classList.contains('minimized')
    };
  });
  localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(layout));
}

function applyCardLayout(card, layout) {
  const x = snapValue(layout.x ?? 0);
  const y = snapValue(layout.y ?? 0);
  const width = Math.max(MIN_CARD_WIDTH, snapValue(layout.width ?? MIN_CARD_WIDTH));
  const height = Math.max(MIN_CARD_HEIGHT, snapValue(layout.height ?? MIN_CARD_HEIGHT));

  card.dataset.x = String(x);
  card.dataset.y = String(y);
  card.dataset.width = String(width);
  card.dataset.height = String(height);

  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
  card.style.width = `${width}px`;
  card.style.height = `${height}px`;

  const minimized = Boolean(layout.minimized);
  card.classList.toggle('minimized', minimized);
  const minimizeButton = card.querySelector('[data-card-minimize]');
  if (minimizeButton) minimizeButton.textContent = minimized ? '+' : '_';
}

function toggleCardMinimized(card) {
  const willMinimize = !card.classList.contains('minimized');
  card.classList.toggle('minimized', willMinimize);
  const minimizeButton = card.querySelector('[data-card-minimize]');
  if (minimizeButton) minimizeButton.textContent = willMinimize ? '+' : '_';
  saveDashboardLayout();
}

function startDashboardDrag(card, event) {
  if (immersiveMode) return;
  event.preventDefault();
  bringCardToFront(card);
  activeDashboardInteraction = {
    type: 'drag',
    card,
    startX: event.clientX,
    startY: event.clientY,
    originX: Number(card.dataset.x || 0),
    originY: Number(card.dataset.y || 0)
  };
  card.classList.add('dragging');
}

function startDashboardResize(card, event) {
  if (immersiveMode || card.classList.contains('minimized')) return;
  event.preventDefault();
  event.stopPropagation();
  bringCardToFront(card);
  activeDashboardInteraction = {
    type: 'resize',
    card,
    startX: event.clientX,
    startY: event.clientY,
    originWidth: Number(card.dataset.width || card.offsetWidth),
    originHeight: Number(card.dataset.height || card.offsetHeight),
    originX: Number(card.dataset.x || 0),
    originY: Number(card.dataset.y || 0)
  };
  card.classList.add('resizing');
}

function bringCardToFront(card) {
  const maxZ = dashboardCards.reduce((highest, item) => {
    const value = Number(item.style.zIndex || 1);
    return Math.max(highest, value);
  }, 1);
  card.style.zIndex = String(maxZ + 1);
}

function handleDashboardInteraction(event) {
  if (!activeDashboardInteraction) return;

  const { card, type } = activeDashboardInteraction;
  const bounds = dashboard.getBoundingClientRect();

  if (type === 'drag') {
    const deltaX = event.clientX - activeDashboardInteraction.startX;
    const deltaY = event.clientY - activeDashboardInteraction.startY;
    const width = Number(card.dataset.width || card.offsetWidth);
    const height = card.classList.contains('minimized')
      ? card.querySelector('.card-header').offsetHeight
      : Number(card.dataset.height || card.offsetHeight);

    let nextX = activeDashboardInteraction.originX + deltaX;
    let nextY = activeDashboardInteraction.originY + deltaY;
    nextX = clamp(nextX, DASHBOARD_PADDING, bounds.width - width - DASHBOARD_PADDING);
    nextY = clamp(nextY, DASHBOARD_PADDING, bounds.height - height - DASHBOARD_PADDING);

    nextX = applySnap(nextX, bounds.width - width - DASHBOARD_PADDING);
    nextY = applySnap(nextY, bounds.height - height - DASHBOARD_PADDING);

    card.dataset.x = String(nextX);
    card.dataset.y = String(nextY);
    card.style.left = `${nextX}px`;
    card.style.top = `${nextY}px`;
    return;
  }

  const deltaX = event.clientX - activeDashboardInteraction.startX;
  const deltaY = event.clientY - activeDashboardInteraction.startY;
  let nextWidth = activeDashboardInteraction.originWidth + deltaX;
  let nextHeight = activeDashboardInteraction.originHeight + deltaY;

  nextWidth = Math.max(MIN_CARD_WIDTH, nextWidth);
  nextHeight = Math.max(MIN_CARD_HEIGHT, nextHeight);
  nextWidth = Math.min(nextWidth, bounds.width - activeDashboardInteraction.originX - DASHBOARD_PADDING);
  nextHeight = Math.min(nextHeight, bounds.height - activeDashboardInteraction.originY - DASHBOARD_PADDING);
  nextWidth = applySnap(nextWidth, bounds.width - activeDashboardInteraction.originX - DASHBOARD_PADDING);
  nextHeight = applySnap(nextHeight, bounds.height - activeDashboardInteraction.originY - DASHBOARD_PADDING);

  card.dataset.width = String(nextWidth);
  card.dataset.height = String(nextHeight);
  card.style.width = `${nextWidth}px`;
  card.style.height = `${nextHeight}px`;
}

function stopDashboardInteraction() {
  if (!activeDashboardInteraction) return;
  activeDashboardInteraction.card.classList.remove('dragging', 'resizing');
  activeDashboardInteraction = null;
  saveDashboardLayout();
}

function snapValue(value) {
  return Math.round(value / SNAP_SIZE) * SNAP_SIZE;
}

function applySnap(value, maxValue) {
  const snapped = snapValue(value);
  const edgeThreshold = SNAP_SIZE;

  if (Math.abs(snapped - DASHBOARD_PADDING) <= edgeThreshold) {
    return DASHBOARD_PADDING;
  }
  if (Math.abs(maxValue - snapped) <= edgeThreshold) {
    return maxValue;
  }
  return snapped;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
