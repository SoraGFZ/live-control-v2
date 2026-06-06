// Hytale Survival Chaos - Módulo de integración con TikControl
// Comunicación TCP con el plugin Java de Hytale

const { ipcMain, app, dialog } = require('electron');
const net = require('net');
const path = require('path');
const fs = require('fs');
const https = require('https');
const EventEmitter = require('events');
const { resolveDir } = require('../steamDetect');

class HytaleService extends EventEmitter {
    constructor() {
        super();
        this.PORT = 9998;
        this.server = null;
        this.client = null;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.gameConfig = {};
        this.mainWindow = null;
        this.handlersRegistered = false;
        this.isConnected = false;
        this.retryTimer = null;
        
        // Jugador objetivo (al que se aplican los efectos)
        this.targetPlayer = null;
        
        // Estado del juego Survival
        this.survivalState = {
            active: false,
            startTime: null,
            playerHealth: 100,
            kills: 0,
            deaths: 0,
            activeMobs: 0
        };
    }

    initialize(mainWindow) {
        this.mainWindow = mainWindow;
        this.loadSavedGamePaths();
        this.registerIpcHandlers();
        this.start();
        // console.log('[Hytale] 🎮 Módulo inicializado');
    }

    loadSavedGamePaths() {
        try {
            const configPath = path.join(app.getPath('userData'), 'electron-config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                Object.keys(config).forEach(key => {
                    if (key.startsWith('hytale_game_path_')) {
                        const profileId = key.replace('hytale_game_path_', '');
                        this.gameConfig[profileId] = config[key];
                    }
                    if (key.startsWith('hytale_target_player_')) {
                        const profileId = key.replace('hytale_target_player_', '');
                        if (!this.gameConfig[profileId]) this.gameConfig[profileId] = {};
                        this.gameConfig[`${profileId}_target`] = config[key];
                    }
                });
                // Cargar target player global
                if (config.hytale_target_player) {
                    this.targetPlayer = config.hytale_target_player;
                    console.log('[Hytale] 🎯 Target player cargado:', this.targetPlayer);
                }
            }
        } catch (e) {
            console.error('[Hytale] Error cargando rutas guardadas:', e);
        }
    }

    saveTargetPlayer(playerName) {
        try {
            const configPath = path.join(app.getPath('userData'), 'electron-config.json');
            let config = {};
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
            config.hytale_target_player = playerName;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            this.targetPlayer = playerName;
            console.log('[Hytale] 🎯 Target player guardado:', playerName);
        } catch (e) {
            console.error('[Hytale] Error guardando target player:', e);
        }
    }

    saveGamePath(profileId, gamePath) {
        try {
            const configPath = path.join(app.getPath('userData'), 'electron-config.json');
            let config = {};
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
            config[`hytale_game_path_${profileId}`] = gamePath;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            this.gameConfig[profileId] = gamePath;
        } catch (e) {
            console.error('[Hytale] Error guardando ruta:', e);
        }
    }

    start() {
        if (this.server) {
            console.log('[Hytale] Servidor ya está corriendo');
            return;
        }

        this.server = net.createServer((socket) => {
            console.log('[Hytale] ✅ Juego conectado!');
            this.client = socket;
            this.isConnected = true;

            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('hytale:connected', true);
            }

            let buffer = '';
            socket.on('data', (data) => {
                buffer += data.toString();

                // Procesar mensajes JSON (terminados en newline)
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Mantener datos incompletos

                lines.forEach(line => {
                    if (line.trim()) {
                        try {
                            const msg = JSON.parse(line);
                            this.handleMessage(msg);
                        } catch (e) {
                            console.error('[Hytale] Error parseando mensaje:', e);
                        }
                    }
                });
            });

            socket.on('close', () => {
                console.log('[Hytale] ❌ Juego desconectado');
                this.client = null;
                this.isConnected = false;
                this.survivalState.active = false;
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('hytale:connected', false);
                }
            });

            socket.on('error', (err) => {
                console.error('[Hytale] Error de socket:', err.message);
            });
        });

        this.server.listen(this.PORT, '127.0.0.1', () => {
            // console.log(`[Hytale] 🎮 Servidor TCP escuchando en puerto ${this.PORT}`);
        });

        this.server.on('error', (err) => {
            console.error('[Hytale] Error del servidor:', err);
            if (err.code === 'EADDRINUSE') {
                console.log('[Hytale] Puerto en uso, reintentando en 5s...');
                if (this.retryTimer) clearTimeout(this.retryTimer);
                this.retryTimer = setTimeout(() => {
                    this.retryTimer = null;
                    this.server?.close();
                    this.server = null;
                    this.start();
                }, 5000);
                if (typeof this.retryTimer.unref === 'function') this.retryTimer.unref();
            }
        });
    }

    handleMessage(msg) {
        console.log('[Hytale] 📥 Mensaje recibido:', msg);

        // Respuesta a un comando
        if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
            const { resolve } = this.pendingRequests.get(msg.requestId);
            this.pendingRequests.delete(msg.requestId);
            resolve(msg);
            return;
        }

        // Eventos del juego
        if (msg.type === 'event') {
            this.handleGameEvent(msg);
        }
        
        // Actualización de estado
        if (msg.type === 'state_update') {
            this.updateSurvivalState(msg.state);
        }
    }

    handleGameEvent(msg) {
        switch (msg.event) {
            case 'player_death':
                this.survivalState.deaths++;
                console.log(`[Hytale] 💀 Jugador murió! Muertes: ${this.survivalState.deaths}`);
                break;
            case 'mob_killed':
                this.survivalState.kills++;
                this.survivalState.activeMobs = Math.max(0, this.survivalState.activeMobs - 1);
                console.log(`[Hytale] ⚔️ Mob eliminado! Kills: ${this.survivalState.kills}`);
                break;
            case 'mob_spawned':
                this.survivalState.activeMobs++;
                break;
            case 'survival_started':
                this.survivalState.active = true;
                this.survivalState.startTime = Date.now();
                this.survivalState.kills = 0;
                this.survivalState.deaths = 0;
                console.log('[Hytale] 🎮 Survival Chaos iniciado!');
                break;
            case 'survival_ended':
                this.survivalState.active = false;
                console.log('[Hytale] 🏁 Survival Chaos terminado!');
                break;
        }

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('hytale:gameEvent', msg);
            this.mainWindow.webContents.send('hytale:survivalState', this.survivalState);
        }
    }

    updateSurvivalState(state) {
        this.survivalState = { ...this.survivalState, ...state };
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('hytale:survivalState', this.survivalState);
        }
    }

    /**
     * Traduce comandos de la UI al formato que entiende el plugin Java
     */
    translateCommand(command, parameters = {}) {
        // Comandos de spawn de mobs (spawn_XXX -> spawn_mob con mob_type)
        const mobSpawnCommands = {
            'spawn_trork_warrior': 'trork_warrior',
            'spawn_trork_hunter': 'trork_hunter',
            'spawn_trork_shaman': 'trork_shaman',
            'spawn_trork_sentry': 'trork_sentry',
            'spawn_trork_chieftain': 'trork_chieftain',
            'spawn_scarak_worker': 'scarak_worker',
            'spawn_scarak_larva': 'scarak_larva',
            'spawn_scarak_warrior': 'scarak_warrior',
            'spawn_scarak_locust': 'scarak_locust',
            'spawn_scarak_tank': 'scarak_tank',
            'spawn_scarak_broodmother': 'scarak_broodmother',
            'spawn_wolf': 'wolf',
            'spawn_bat_swarm': 'bat',
            'spawn_fen_stalker': 'fen_stalker',
            'spawn_grizzly': 'grizzly',
            'spawn_sabertooth': 'sabertooth',
            'spawn_yeti': 'yeti',
            'spawn_raptor': 'raptor',
            'spawn_void_spawn': 'void_spawn',
            'spawn_void_eye': 'void_eye',
            'spawn_outlander_mage': 'outlander_mage',
            'spawn_trork_raid': 'trork_raid',
            'spawn_scarak_swarm': 'scarak_swarm',
            'spawn_chaos_horde': 'chaos_horde'
        };

        // Comandos de spawn de aliados (spawn_ally_XXX -> spawn_ally con ally_type)
        const allySpawnCommands = {
            'spawn_ally_wolf': 'wolf',
            'spawn_ally_kweebec': 'kweebec',
            'spawn_ally_feran': 'feran',
            'spawn_army': 'army'
        };

        // Comandos de items (give_XXX -> give_item con item_id)
        const itemCommands = {
            'give_arrows': { item_id: 'arrow', quantity: 5 },
            'give_arrows_bundle': { item_id: 'arrow', quantity: 24 },
            'give_food': { item_id: 'cooked_meat', quantity: 4 },
            'give_repair_kit': { item_id: 'repair_kit', quantity: 1 }
        };

        // Comandos de buffs (buff_XXX -> apply_effect con effect_type)
        const buffCommands = {
            'buff_speed': { effect_type: 'speed', duration: 20 },
            'buff_strength': { effect_type: 'strength', duration: 20 },
            'buff_regen': { effect_type: 'regeneration', duration: 30 },
            'buff_invincible': { effect_type: 'invincibility', duration: 15 },
            'godmode': { effect_type: 'godmode', duration: 60 }
        };

        // Comandos de curación (heal_XXX -> heal_player con amount)
        const healCommands = {
            'heal_small': 'small',
            'heal_medium': 'medium',
            'heal_full': 'full'
        };

        // Comandos de upgrade (upgrade_XXX -> upgrade_gear)
        const upgradeCommands = {
            'upgrade_weapon_thorium': { gear_type: 'weapon', tier: 'thorium' },
            'upgrade_armor_thorium': { gear_type: 'armor', tier: 'thorium' },
            'upgrade_weapon_cobalt': { gear_type: 'weapon', tier: 'cobalt' },
            'upgrade_armor_cobalt': { gear_type: 'armor', tier: 'cobalt' },
            'upgrade_weapon_adamantite': { gear_type: 'weapon', tier: 'adamantite' },
            'upgrade_weapon_mithril': { gear_type: 'weapon', tier: 'mithril' },
            'upgrade_armor_mithril': { gear_type: 'armor', tier: 'mithril' }
        };

        // Comandos especiales (XXX -> trigger_special)
        const specialCommands = {
            'mystery_box': 'mystery_box',
            'weather_storm': 'storm',
            'weather_fog': 'fog',
            'drop_inventory': 'drop_item',
            'reverse_controls': 'reverse_controls',
            'blind': 'blindness',
            'slow': 'slowness'
        };

        // Comandos de clear
        const clearCommands = {
            'clear_mobs_50': 50,
            'clear_all_mobs': 100
        };

        // Base: siempre incluir target_player si está configurado o llega desde la UI.
        const baseParams = {};
        const targetPlayer = parameters.target_player || parameters.targetPlayer || parameters.player_name || parameters.playerName || this.targetPlayer;
        if (targetPlayer) {
            baseParams.target_player = targetPlayer;
        }

        // Traducir spawn de mobs
        if (mobSpawnCommands[command]) {
            return {
                command: 'spawn_mob',
                parameters: {
                    ...baseParams,
                    mob_type: mobSpawnCommands[command],
                    quantity: parameters.quantity || 1,
                    spawned_by: parameters.username || 'Viewer'
                }
            };
        }

        // Traducir spawn de aliados
        if (allySpawnCommands[command]) {
            return {
                command: 'spawn_ally',
                parameters: {
                    ...baseParams,
                    ally_type: allySpawnCommands[command],
                    duration: parameters.duration || 60,
                    spawned_by: parameters.username || 'Viewer'
                }
            };
        }

        // Traducir items
        if (itemCommands[command]) {
            return {
                command: 'give_item',
                parameters: {
                    ...baseParams,
                    item_id: itemCommands[command].item_id,
                    quantity: itemCommands[command].quantity,
                    given_by: parameters.username || 'Viewer'
                }
            };
        }

        // Traducir buffs
        if (buffCommands[command]) {
            return {
                command: 'apply_effect',
                parameters: {
                    ...baseParams,
                    effect_type: buffCommands[command].effect_type,
                    duration: parameters.duration || buffCommands[command].duration,
                    applied_by: parameters.username || 'Viewer'
                }
            };
        }

        // Traducir curación
        if (healCommands[command]) {
            return {
                command: 'heal_player',
                parameters: {
                    ...baseParams,
                    amount: healCommands[command],
                    healed_by: parameters.username || 'Viewer'
                }
            };
        }

        // Traducir upgrades
        if (upgradeCommands[command]) {
            return {
                command: 'upgrade_gear',
                parameters: {
                    ...baseParams,
                    gear_type: upgradeCommands[command].gear_type,
                    tier: upgradeCommands[command].tier,
                    upgraded_by: parameters.username || 'Viewer'
                }
            };
        }

        // Traducir especiales
        if (specialCommands[command]) {
            return {
                command: 'trigger_special',
                parameters: {
                    ...baseParams,
                    special_type: specialCommands[command],
                    triggered_by: parameters.username || 'Viewer',
                    duration: parameters.duration
                }
            };
        }

        // Traducir clear mobs
        if (clearCommands[command] !== undefined) {
            return {
                command: 'clear_mobs',
                parameters: {
                    ...baseParams,
                    percentage: clearCommands[command]
                }
            };
        }

        // Si no hay traducción, enviar tal cual (con target_player)
        return { command, parameters: { ...baseParams, ...parameters } };
    }

    async executeCommand(command, parameters = {}) {
        return new Promise((resolve, reject) => {
            if (!this.client || !this.isConnected) {
                reject(new Error('Juego no conectado. Asegúrate de que Hytale esté ejecutándose con el plugin de TikControl.'));
                return;
            }

            // Traducir el comando al formato del plugin
            const translated = this.translateCommand(command, parameters);
            console.log('[Hytale] 🔄 Traduciendo comando:', command, '->', translated.command, translated.parameters);

            const requestId = ++this.requestId;
            const msg = {
                type: 'command',
                requestId,
                command: translated.command,
                parameters: translated.parameters
            };

            // Timeout de 10 segundos
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    resolve({ success: false, message: 'Timeout - sin respuesta del juego' });
                }
            }, 10000);

            this.pendingRequests.set(requestId, {
                resolve: (response) => {
                    clearTimeout(timeout);
                    resolve(response);
                },
                reject
            });

            try {
                this.client.write(JSON.stringify(msg) + '\n');
                console.log('[Hytale] 📤 Comando enviado:', translated.command, translated.parameters);
            } catch (e) {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(new Error('Error enviando comando: ' + e.message));
            }
        });
    }

    // ============================================
    // COMANDOS DE SURVIVAL CHAOS
    // ============================================

    // Iniciar el modo Survival (equipa al jugador)
    async startSurvival(options = {}) {
        return this.executeCommand('start_survival', {
            armor_tier: options.armor_tier || 'iron',
            weapon_tier: options.weapon_tier || 'iron',
            food_amount: options.food_amount || 16,
            arrows: options.arrows || 32,
            potions: options.potions || 2
        });
    }

    // Terminar el modo Survival
    async stopSurvival() {
        return this.executeCommand('stop_survival', {});
    }

    // Spawn de mobs
    async spawnMob(mobType, quantity = 1, username = 'Viewer') {
        return this.executeCommand('spawn_mob', {
            mob_type: mobType,
            quantity,
            spawned_by: username
        });
    }

    // Dar item al jugador
    async giveItem(itemId, quantity = 1, username = 'Viewer') {
        return this.executeCommand('give_item', {
            item_id: itemId,
            quantity,
            given_by: username
        });
    }

    // Aplicar efecto al jugador
    async applyEffect(effectType, duration = 20, username = 'Viewer') {
        return this.executeCommand('apply_effect', {
            effect_type: effectType,
            duration,
            applied_by: username
        });
    }

    // Mejorar equipamiento
    async upgradeGear(gearType, newTier, username = 'Viewer') {
        return this.executeCommand('upgrade_gear', {
            gear_type: gearType, // 'weapon', 'armor', 'all'
            tier: newTier,      // 'thorium', 'cobalt', 'adamantite', 'mithril'
            upgraded_by: username
        });
    }

    // Spawn aliado
    async spawnAlly(allyType, duration = 60, username = 'Viewer') {
        return this.executeCommand('spawn_ally', {
            ally_type: allyType,
            duration,
            spawned_by: username
        });
    }

    // Eliminar mobs
    async clearMobs(percentage = 100) {
        return this.executeCommand('clear_mobs', {
            percentage
        });
    }

    // Curar jugador
    async healPlayer(amount, username = 'Viewer') {
        return this.executeCommand('heal_player', {
            amount, // 'small' (20%), 'medium' (50%), 'full' (100%)
            healed_by: username
        });
    }

    // Efecto especial (clima, tiempo, etc)
    async triggerSpecial(specialType, username = 'Viewer') {
        return this.executeCommand('trigger_special', {
            special_type: specialType,
            triggered_by: username
        });
    }

    registerIpcHandlers() {
        if (this.handlersRegistered) {
            return;
        }

        this.handlersRegistered = true;
        // Ejecutar efecto genérico
        ipcMain.handle('hytale:executeEffect', async (event, command, parameters) => {
            try {
                const result = await this.executeCommand(command, parameters || {});
                return result;
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        // Iniciar Survival
        ipcMain.handle('hytale:startSurvival', async (event, options) => {
            try {
                return await this.startSurvival(options);
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        // Detener Survival
        ipcMain.handle('hytale:stopSurvival', async () => {
            try {
                return await this.stopSurvival();
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        // Spawn mob
        ipcMain.handle('hytale:spawnMob', async (event, mobType, quantity, username) => {
            try {
                return await this.spawnMob(mobType, quantity, username);
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        // Estado de conexión
        ipcMain.handle('hytale:getConnectionStatus', async () => {
            return { 
                connected: this.isConnected,
                survivalActive: this.survivalState.active,
                state: this.survivalState,
                targetPlayer: this.targetPlayer
            };
        });

        // Configurar jugador objetivo
        ipcMain.handle('hytale:setTargetPlayer', async (event, playerName) => {
            this.saveTargetPlayer(playerName);
            console.log('[Hytale] 🎯 Target player configurado:', playerName);
            return { success: true, targetPlayer: playerName };
        });

        // Obtener jugador objetivo
        ipcMain.handle('hytale:getTargetPlayer', async () => {
            return { targetPlayer: this.targetPlayer };
        });

        // Estado del Survival
        ipcMain.handle('hytale:getSurvivalState', async () => {
            return this.survivalState;
        });

        ipcMain.handle('hytale:setGamePath', async (event, a, b) => {
            const { resolveSetGamePathArgs } = require('../setGamePathArgs');
            let { profileId, path: newPath } = resolveSetGamePathArgs(a, b);
            if (!newPath || !fs.existsSync(newPath)) {
                return { success: false, error: 'Ruta inválida' };
            }
            const key = profileId || 'default';
            this.saveGamePath(key, newPath);
            return { success: true, path: newPath };
        });

        // Obtener ruta del juego
        ipcMain.handle('hytale:getGamePath', async (event, profileId) => {
            return { path: this.gameConfig[profileId] || null };
        });

        // Buscar juego (rutas comunes)
        ipcMain.handle('hytale:findGame', async () => {
            const possiblePaths = [
                'C:\\Program Files\\Hytale\\Hytale.exe',
                'C:\\Program Files (x86)\\Hytale\\Hytale.exe',
                'C:\\Hytale\\Hytale.exe',
                'D:\\Hytale\\Hytale.exe',
                path.join(process.env.LOCALAPPDATA || '', 'Hytale', 'Hytale.exe'),
                path.join(process.env.APPDATA || '', 'Hytale', 'Hytale.exe')
            ];

            for (const exePath of possiblePaths) {
                if (fs.existsSync(exePath)) {
                    return { success: true, path: exePath };
                }
            }
            return { success: false };
        });

        // Instalar plugin
        ipcMain.handle('hytale:installPlugin', async (event, profileId) => {
            const gamePath = this.gameConfig[profileId];
            if (!gamePath) {
                return { success: false, error: 'Ruta del juego no configurada' };
            }

            const gameDir = resolveDir(gamePath);
            const pluginsDir = path.join(gameDir, 'mods');
            const pluginUrl = 'https://storage.tikcontrol.live/games/hytale-survival/TikControlHytale.jar';
            
            try {
                // Crear directorio de mods si no existe
                if (!fs.existsSync(pluginsDir)) {
                    fs.mkdirSync(pluginsDir, { recursive: true });
                }

                this.sendProgress('📥 Descargando plugin TikControl para Hytale...');
                
                const pluginPath = path.join(pluginsDir, 'TikControlHytale.jar');
                
                await new Promise((resolve, reject) => {
                    const file = fs.createWriteStream(pluginPath);
                    
                    const downloadWithRedirects = (url, redirectCount = 0) => {
                        if (redirectCount > 5) {
                            reject(new Error('Demasiadas redirecciones'));
                            return;
                        }

                        https.get(url, {
                            headers: { 'User-Agent': 'TikControl/1.0' }
                        }, (response) => {
                            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                                downloadWithRedirects(response.headers.location, redirectCount + 1);
                                return;
                            }

                            if (response.statusCode !== 200) {
                                reject(new Error(`Error HTTP: ${response.statusCode}`));
                                return;
                            }

                            response.pipe(file);
                            file.on('finish', () => {
                                file.close();
                                resolve();
                            });
                        }).on('error', (err) => {
                            fs.unlink(pluginPath, () => {});
                            reject(err);
                        });
                    };

                    downloadWithRedirects(pluginUrl);
                });

                this.sendProgress('✅ Plugin instalado correctamente!');
                
                return {
                    success: true,
                    message: '¡Plugin TikControl para Hytale instalado! Reinicia el juego para activarlo.'
                };
            } catch (e) {
                console.error('[Hytale] ❌ Error instalando plugin:', e);
                return { success: false, error: e.message };
            }
        });

        // Verificar estado del plugin
        ipcMain.handle('hytale:checkPluginStatus', async (event, profileId) => {
            const gamePath = this.gameConfig[profileId];
            if (!gamePath) {
                return { installed: false, reason: 'No game path' };
            }

            const gameDir = resolveDir(gamePath);
            const pluginPath = path.join(gameDir, 'mods', 'TikControlHytale.jar');

            return {
                installed: fs.existsSync(pluginPath),
                path: pluginPath
            };
        });

        // Lanzar juego
        ipcMain.handle('hytale:launchGame', async (event, profileId) => {
            const gamePath = this.gameConfig[profileId];
            if (!gamePath) {
                return { success: false, error: 'Ruta del juego no configurada' };
            }

            try {
                const { shell } = require('electron');
                const gameDir = resolveDir(gamePath);
                const exeName = 'Hytale.exe';
                const exePath = path.join(gameDir, exeName);
                if (fs.existsSync(exePath)) {
                    await shell.openPath(exePath);
                    return { success: true, method: 'direct' };
                }
                await shell.openPath(gamePath);
                return { success: true, method: 'direct' };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        // console.log('[Hytale] ✅ IPC handlers registrados');
    }

    sendProgress(message) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('hytale:install-progress', { message });
        }
    }

    stop() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        for (const [requestId, pending] of this.pendingRequests) {
            try { pending.resolve({ success: false, error: 'TikControl shutting down', requestId }); } catch (_) {}
        }
        this.pendingRequests.clear();
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
        if (this.server) {
            try { this.server.close(); } catch (_) {}
            this.server = null;
        }
        this.isConnected = false;
    }
}

const service = new HytaleService();

module.exports = {
    initialize: (mainWindow) => service.initialize(mainWindow),
    executeCommand: (cmd, params) => service.executeCommand(cmd, params),
    startSurvival: (options) => service.startSurvival(options),
    stopSurvival: () => service.stopSurvival(),
    spawnMob: (type, qty, user) => service.spawnMob(type, qty, user),
    giveItem: (item, qty, user) => service.giveItem(item, qty, user),
    applyEffect: (effect, dur, user) => service.applyEffect(effect, dur, user),
    upgradeGear: (type, tier, user) => service.upgradeGear(type, tier, user),
    spawnAlly: (type, dur, user) => service.spawnAlly(type, dur, user),
    clearMobs: (pct) => service.clearMobs(pct),
    healPlayer: (amt, user) => service.healPlayer(amt, user),
    triggerSpecial: (type, user) => service.triggerSpecial(type, user),
    getConnectionStatus: () => ({ connected: service.isConnected, state: service.survivalState }),
    stop: () => service.stop()
};
