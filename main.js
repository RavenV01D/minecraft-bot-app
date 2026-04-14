const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const collectBlock = require('mineflayer-collectblock').plugin;
const autoEat = require('mineflayer-auto-eat');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');

let mainWindow;
let bot = null;
let viewerPort = 3001;
let automationIntervals = {};
let macros = {};
let positionInterval = null;
let inventoryListenerCleanup = null;

function getMacrosPath() {
  return path.join(app.getPath('userData'), 'macros.json');
}

function loadMacros() {
  try {
    const macrosPath = getMacrosPath();
    if (!fs.existsSync(macrosPath)) return;
    const content = fs.readFileSync(macrosPath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      macros = parsed;
    }
  } catch (error) {
    console.error('Failed to load macros:', error);
    macros = {};
  }
}

function saveMacros() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(getMacrosPath(), JSON.stringify(macros, null, 2));
  } catch (error) {
    console.error('Failed to save macros:', error);
  }
}

function clearPositionUpdates() {
  if (positionInterval) {
    clearInterval(positionInterval);
    positionInterval = null;
  }
}

function clearAutomation(key) {
  const automation = automationIntervals[key];
  if (!automation) return;

  if (automation.type === 'loop') {
    automation.stopped = true;
    if (automation.timeout) clearTimeout(automation.timeout);
  } else {
    clearInterval(automation);
  }

  delete automationIntervals[key];
}

function serializeItem(item) {
  if (!item) return null;

  return {
    slot: item.slot,
    name: item.name,
    displayName: item.displayName || item.name,
    count: item.count,
    type: item.type,
    metadata: item.metadata,
    stackSize: item.stackSize
  };
}

function getInventorySnapshot() {
  if (!bot || !bot.inventory) {
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

  const slots = bot.inventory.slots;
  const mapSlot = (slot, label = null) => ({
    slot,
    label,
    item: serializeItem(slots[slot])
  });

  return {
    connected: true,
    quickBarSlot: bot.quickBarSlot,
    selectedItem: serializeItem(bot.inventory.selectedItem),
    heldItem: serializeItem(bot.heldItem),
    armor: [
      mapSlot(5, 'Head'),
      mapSlot(6, 'Chest'),
      mapSlot(7, 'Legs'),
      mapSlot(8, 'Boots')
    ],
    offhand: mapSlot(45, 'Offhand'),
    main: Array.from({ length: 27 }, (_, index) => mapSlot(9 + index)),
    hotbar: Array.from({ length: 9 }, (_, index) => mapSlot(36 + index, `${index + 1}`))
  };
}

function emitInventoryUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('inventory-update', getInventorySnapshot());
}

function attachInventoryListeners() {
  if (!bot || !bot.inventory) return;
  detachInventoryListeners();
  const boundBot = bot;

  const syncInventory = () => emitInventoryUpdate();
  boundBot.inventory.on('updateSlot', syncInventory);
  boundBot.on('heldItemChanged', syncInventory);
  boundBot.on('windowOpen', syncInventory);
  boundBot.on('windowClose', syncInventory);

  inventoryListenerCleanup = () => {
    if (!boundBot || !boundBot.inventory) return;
    boundBot.inventory.removeListener('updateSlot', syncInventory);
    boundBot.removeListener('heldItemChanged', syncInventory);
    boundBot.removeListener('windowOpen', syncInventory);
    boundBot.removeListener('windowClose', syncInventory);
  };
}

function detachInventoryListeners() {
  if (inventoryListenerCleanup) {
    inventoryListenerCleanup();
    inventoryListenerCleanup = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  loadMacros();
  createWindow();
});

app.on('window-all-closed', () => {
  if (bot) bot.quit();
  detachInventoryListeners();
  clearPositionUpdates();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Bot connection
ipcMain.handle('connect-bot', async (event, config) => {
  try {
    if (bot) {
      detachInventoryListeners();
      bot.quit();
      stopAllAutomation();
    }

    bot = mineflayer.createBot({
      host: config.host,
      port: config.port || 25565,
      username: config.username,
      version: config.version || false,
      auth: 'offline',
      checkTimeoutInterval: 60000,
      keepAlive: true
    });

    // Load plugins
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectBlock);
    attachInventoryListeners();

    bot.once('spawn', () => {
      // Initialize pathfinder
      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      bot.pathfinder.setMovements(defaultMove);

      // Load auto-eat plugin after spawn to avoid timing issues
      bot.loadPlugin(autoEat);
      
      // Auto-eat configuration
      bot.autoEat.options = {
        priority: 'foodPoints',
        startAt: 14,
        bannedFood: []
      };

      // Start viewer
      mineflayerViewer(bot, { port: viewerPort, firstPerson: true });

      mainWindow.webContents.send('bot-ready', {
        username: bot.username,
        version: bot.version,
        viewerPort: viewerPort
      });
      emitInventoryUpdate();

      // Position updates
      clearPositionUpdates();
      positionInterval = setInterval(() => {
        if (bot && bot.entity) {
          mainWindow.webContents.send('bot-position', {
            x: bot.entity.position.x.toFixed(2),
            y: bot.entity.position.y.toFixed(2),
            z: bot.entity.position.z.toFixed(2),
            yaw: ((bot.entity.yaw * 180 / Math.PI) % 360).toFixed(1),
            pitch: ((bot.entity.pitch * 180 / Math.PI)).toFixed(1),
            health: bot.health,
            food: bot.food,
            onGround: bot.entity.onGround
          });
        }
      }, 100);
    });

    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      mainWindow.webContents.send('bot-chat', { username, message });
    });

    bot.on('error', (err) => {
      mainWindow.webContents.send('bot-error', err.message);
    });

    bot.on('kicked', (reason) => {
      mainWindow.webContents.send('bot-error', `Kicked: ${reason}`);
    });

    bot.on('end', () => {
      mainWindow.webContents.send('bot-disconnected');
      detachInventoryListeners();
      bot = null;
      clearPositionUpdates();
      stopAllAutomation();
      emitInventoryUpdate();
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Movement controls
ipcMain.on('control-state', (event, { action, state }) => {
  if (!bot) return;
  bot.setControlState(action, state);
});

// Look controls
ipcMain.on('look-at', (event, { yaw, pitch }) => {
  if (!bot) return;
  bot.look(yaw * Math.PI / 180, pitch * Math.PI / 180, true);
});

// Actions
ipcMain.on('bot-action', async (event, action) => {
  if (!bot) return;
  
  switch (action) {
    case 'attack':
      // Swing arm for animation
      bot.swingArm();
      
      // First try to attack nearest entity
      const target = bot.nearestEntity(e => e.type !== 'object' && e.type !== 'orb');
      if (target && target.position.distanceTo(bot.entity.position) < 4) {
        bot.attack(target);
      } else {
        // If no entity, try to dig block at crosshair
        const block = bot.blockAtCursor(5);
        if (block && bot.canDigBlock(block)) {
          try {
            await bot.dig(block);
          } catch (err) {
            // Ignore dig errors
          }
        }
      }
      break;
    case 'use':
      // Try to use block at crosshair first
      const targetBlock = bot.blockAtCursor(5);
      if (targetBlock) {
        bot.activateBlock(targetBlock);
      } else {
        // Otherwise activate item in hand
        bot.activateItem();
      }
      break;
    case 'drop':
      if (bot.inventory.slots[bot.quickBarSlot + 36]) {
        bot.tossStack(bot.inventory.slots[bot.quickBarSlot + 36]);
      }
      break;
    case 'swap':
      bot.swapHands();
      break;
  }
});

// Chat
ipcMain.on('send-chat', (event, message) => {
  if (!bot) return;
  bot.chat(message);
});

// Disconnect
ipcMain.on('disconnect-bot', () => {
  if (bot) {
    bot.quit();
    detachInventoryListeners();
    clearPositionUpdates();
    stopAllAutomation();
  }
});

ipcMain.handle('get-inventory', () => {
  return getInventorySnapshot();
});

ipcMain.handle('inventory-action', async (event, payload) => {
  if (!bot || !bot.inventory) {
    return { success: false, error: 'Bot is not connected', inventory: getInventorySnapshot() };
  }

  try {
    switch (payload.type) {
      case 'select-hotbar':
        if (typeof payload.hotbarIndex !== 'number' || payload.hotbarIndex < 0 || payload.hotbarIndex > 8) {
          throw new Error('Invalid hotbar slot');
        }
        bot.setQuickBarSlot(payload.hotbarIndex);
        break;
      case 'toss-slot': {
        const item = bot.inventory.slots[payload.slot];
        if (!item) throw new Error('That slot is empty');
        await bot.tossStack(item);
        break;
      }
      case 'move-slot':
        if (typeof payload.slot !== 'number' || typeof payload.targetSlot !== 'number') {
          throw new Error('Invalid inventory move');
        }
        if (payload.slot !== payload.targetSlot) {
          await bot.moveSlotItem(payload.slot, payload.targetSlot);
        }
        break;
      case 'equip-slot':
        if (typeof payload.slot !== 'number') throw new Error('Invalid slot');
        if (payload.slot >= 36 && payload.slot <= 44) {
          bot.setQuickBarSlot(payload.slot - 36);
        } else {
          await bot.moveSlotItem(payload.slot, 36 + bot.quickBarSlot);
        }
        break;
      default:
        throw new Error('Unknown inventory action');
    }

    emitInventoryUpdate();
    return { success: true, inventory: getInventorySnapshot() };
  } catch (error) {
    emitInventoryUpdate();
    return { success: false, error: error.message, inventory: getInventorySnapshot() };
  }
});

// Auto-mining
ipcMain.on('toggle-auto-mine', (event, { enabled, blockName }) => {
  if (!bot) return;
  
  if (enabled) {
    clearAutomation('mining');
    automationIntervals.mining = setInterval(async () => {
      try {
        const mcData = require('minecraft-data')(bot.version);
        const blockType = mcData.blocksByName[blockName];
        if (!blockType) return;

        const block = bot.findBlock({
          matching: blockType.id,
          maxDistance: 32,
          count: 1
        });

        if (block) {
          await bot.collectBlock.collect(block);
          mainWindow.webContents.send('automation-log', `Mined ${blockName}`);
        }
      } catch (err) {
        mainWindow.webContents.send('automation-log', `Mining error: ${err.message}`);
      }
    }, 1000);
  } else {
    clearAutomation('mining');
  }
});

// PvP mode
ipcMain.on('toggle-pvp', (event, enabled) => {
  if (!bot) return;
  
  if (enabled) {
    clearAutomation('pvp');
    automationIntervals.pvp = setInterval(() => {
      const entity = bot.nearestEntity(e => 
        e.type === 'player' && 
        e.username !== bot.username && 
        e.position.distanceTo(bot.entity.position) < 4
      );

      if (entity) {
        bot.pvp.attack(entity);
      }
    }, 100);
  } else {
    bot.pvp.stop();
    clearAutomation('pvp');
  }
});

// Follow player
ipcMain.on('follow-player', (event, { enabled, username }) => {
  if (!bot) return;
  
  if (enabled) {
    clearAutomation('follow');
    const followTask = () => {
      const player = bot.players[username]?.entity;
      if (player) {
        const goal = new goals.GoalFollow(player, 2);
        bot.pathfinder.setGoal(goal, true);
      }
    };
    
    automationIntervals.follow = setInterval(followTask, 500);
  } else {
    bot.pathfinder.setGoal(null);
    clearAutomation('follow');
  }
});

// Macro system
ipcMain.on('save-macro', (event, { name, actions }) => {
  macros[name] = actions;
  saveMacros();
  mainWindow.webContents.send('macro-saved', { name, count: Object.keys(macros).length });
});

ipcMain.on('run-macro', async (event, { name, repeat }) => {
  if (!bot || !macros[name]) return;
  
  const actions = macros[name];
  
  const executeMacro = async () => {
    for (const action of actions) {
      if (!bot) break;
      
      switch (action.type) {
        case 'control':
          bot.setControlState(action.control, true);
          await sleep(action.duration);
          bot.setControlState(action.control, false);
          break;
        case 'look':
          bot.look(action.yaw * Math.PI / 180, action.pitch * Math.PI / 180, true);
          break;
        case 'attack':
          bot.attack(bot.nearestEntity());
          break;
        case 'use':
          bot.activateItem();
          break;
        case 'chat':
          bot.chat(action.message);
          break;
        case 'wait':
          await sleep(action.duration);
          break;
      }
    }
  };
  
  if (repeat) {
    const key = `macro_${name}`;
    clearAutomation(key);

    const macroLoop = {
      type: 'loop',
      running: false,
      stopped: false,
      timeout: null
    };

    const scheduleNextRun = (delay = 100) => {
      if (macroLoop.stopped) return;
      macroLoop.timeout = setTimeout(async () => {
        if (macroLoop.running || macroLoop.stopped) return;
        macroLoop.running = true;
        try {
          await executeMacro();
        } finally {
          macroLoop.running = false;
          scheduleNextRun();
        }
      }, delay);
    };

    automationIntervals[key] = macroLoop;
    scheduleNextRun(0);
  } else {
    await executeMacro();
  }
});

ipcMain.on('stop-macro', (event, name) => {
  clearAutomation(`macro_${name}`);
});

ipcMain.handle('get-macros', () => {
  return Object.keys(macros);
});

function stopAllAutomation() {
  Object.keys(automationIntervals).forEach(clearAutomation);
  if (bot) {
    bot.pathfinder.setGoal(null);
    bot.pvp.stop();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
