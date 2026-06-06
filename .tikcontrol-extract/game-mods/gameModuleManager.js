/**
 * 🎮 Game Module Manager - Carga lazy de módulos de juegos
 * v1.12.15
 * 
 * Solo carga los módulos de juegos que están configurados en el perfil activo.
 * Cuando el perfil cambia, cierra los módulos no usados y abre los nuevos.
 * 
 * ✅ Detecta juegos dinámicamente desde AWS GamesCloudService
 * ✅ FIX: Detecta juegos con optionKeys que no coinciden con gameId
 */

const logger = require('../utils/logger');

// Mapeo de gameId (del manifest/acciones) → ruta del módulo local
// Este mapeo es necesario porque los módulos locales tienen rutas específicas
// Nuevos juegos desde AWS se detectan automáticamente si siguen la convención de nombres
const MODULE_PATHS = {
    'megabonk': './modules/megabonk/megabonk.js',
    'muck': './modules/muck/muck.js',
    'ror2': './modules/ror2/ror2.js',
    'trickytowers': './modules/tricky-towers/trickytowers.js',
    'lethalcompany': './modules/lethal-company/lethalcompany.js',
    'geometrydash': './modules/others/geometrydash.js',
    'gtav': './modules/gtav/gtavChaos.js',
    'tikcontrolcubo': './modules/others/tikcontrolcubo.js',
    'tikcontrolsandbox': './modules/others/tikcontrolsandbox.js',
    'tikcontrolfarm': './modules/others/tikcontrolfarm.js',
    'tikcontrolkoth': './modules/others/tikcontrolkoth.js',
    'tikcontrolparkour': './modules/others/tikcontrolparkour.js',
    'tikcontroloneblock': './modules/others/tikcontroloneblock.js',
    'tikcontrolbarbershop': './modules/others/tikcontrolbarbershop.js',
    'tikcontrolbattlefield': './modules/others/tikcontrolbattlefield.js',
    'tikcontrolbedrockbox': './modules/others/tikcontrolbedrockbox.js',
    'tikcontrolborder': './modules/others/tikcontrolborder.js',
    'tikcontrolbuilding': './modules/others/tikcontrolbuilding.js',
    'tikcontrolicedarena': './modules/others/tikcontrolicedarena.js',
    'tikcontrolinfiniteblock': './modules/others/tikcontrolinfiniteblock.js',
    'tikcontrolladder': './modules/others/tikcontrolladder.js',
    'tikcontrolmapsets': './modules/others/tikcontrolmapsets.js',
    'tikcontrolpainting': './modules/others/tikcontrolpainting.js',
    'tikcontrolpotsarena': './modules/others/tikcontrolpotsarena.js',
    'tikcontrolsandwall': './modules/others/tikcontrolsandwall.js',
    'tikcontrolsheepout': './modules/others/tikcontrolsheepout.js',
    'tikcontrolshieldrunner': './modules/others/tikcontrolshieldrunner.js',
    'tikcontrolshootinggallery': './modules/others/tikcontrolshootinggallery.js',
    'tikcontrolskyrunner': './modules/others/tikcontrolskyrunner.js',
    'tikcontrolsurvival': './modules/others/tikcontrolsurvival.js',
    'tikcontroltowerdefense': './modules/others/tikcontroltowerdefense.js',
    'tikcontroldiamondchallenge': './modules/others/tikcontroldiamondchallenge.js',
    'twopointedit': './modules/others/twopointedit.js',
    'ghostwatchers': './modules/others/ghostwatchers.js',
    'rvtheryet': './modules/others/rvtheryet.js',
    'repo': './modules/others/repo.js',
    'schedule1': './modules/others/schedule1.js',
    'ranchsimulator': './modules/others/ranchsimulator.js',
    'roadsideresearch': './modules/others/roadsideresearch.js',
    'bloonstd6': './modules/others/bloonstd6.js',
    'overcooked2': './modules/others/overcooked2.js',
    'mysuika': './modules/others/mysuika.js',
    're4': './modules/others/re4.js',
    'hytale-survival': './modules/others/hytale.js',
    'retrorewind': './modules/others/retrorewind.js',
    'raft': './modules/others/raft.js',
    'peak': './modules/others/peak.js',
    'hksilksong': './modules/others/hksilksong.js',
    'cardshopsimulator': './modules/others/cardshopsimulator.js',
    'eggingon': './modules/others/eggingon.js',
    'supermarketsimulator': './modules/others/supermarketsimulator.js',
    'left4dead2': './modules/others/left4dead2.js',
    'waterparksimulator': './modules/others/waterparksimulator.js',
    'duckov': './modules/others/duckov.js',
    'subnautica': './modules/others/subnautica.js',
    'subnautica2': './modules/others/subnautica2.js',
    'yapyap': './modules/others/yapyap.js',
    'hades2': './modules/others/hades2.js',
    'supermarket': './modules/supermarket/supermarketService.js',
    // Aliases con guión para compatibilidad con perfiles antiguos
    // (los IDs canónicos son sin guión, pero algunos perfiles los guardaron con guión).
    'geometry-dash': './modules/others/geometrydash.js',
    'bloons-td6': './modules/others/bloonstd6.js',
    'hytale': './modules/others/hytale.js',
};

// ✅ FIX CRITICO: Mapeo de optionKey (guardada en action.options) → gameId real
// Necesario porque muchos juegos usan optionKeys con sufijo (Effect, Command)
// que NO coinciden con el gameId del módulo.
// Sin este mapeo, detectGamesInProfile NO detecta estos juegos y sus módulos
// NUNCA se cargan → servidores TCP no se inician → IPC handlers no se registran
// → comandos fallan silenciosamente.
const OPTION_KEY_TO_GAME_ID = {
    'gtavCommand':          'gtav',
    'ror2Effect':           'ror2',
    'geometrydashEffect':   'geometrydash',
    'trickytowersEffect':   'trickytowers',
    'lethalcompanyEffect':  'lethalcompany',
    'megabonkEffect':       'megabonk',
    'muckEffect':           'muck',
    'tikcontrolcuboEffect': 'tikcontrolcubo',
    'tikcontrolsandboxEffect': 'tikcontrolsandbox',
    'tikcontrolfarmEffect': 'tikcontrolfarm',
    'tikcontrolkothEffect': 'tikcontrolkoth',
    'tikcontrolparkourEffect': 'tikcontrolparkour',
    'tikcontroloneblockEffect': 'tikcontroloneblock',
    'tikcontrolbarbershopEffect': 'tikcontrolbarbershop',
    'tikcontrolbattlefieldEffect': 'tikcontrolbattlefield',
    'tikcontrolbedrockboxEffect': 'tikcontrolbedrockbox',
    'tikcontrolborderEffect': 'tikcontrolborder',
    'tikcontrolbuildingEffect': 'tikcontrolbuilding',
    'tikcontrolicedarenaEffect': 'tikcontrolicedarena',
    'tikcontrolinfiniteblockEffect': 'tikcontrolinfiniteblock',
    'tikcontrolladderEffect': 'tikcontrolladder',
    'tikcontrolmapsetsEffect': 'tikcontrolmapsets',
    'tikcontrolpaintingEffect': 'tikcontrolpainting',
    'tikcontrolpotsarenaEffect': 'tikcontrolpotsarena',
    'tikcontrolsandwallEffect': 'tikcontrolsandwall',
    'tikcontrolsheepoutEffect': 'tikcontrolsheepout',
    'tikcontrolshieldrunnerEffect': 'tikcontrolshieldrunner',
    'tikcontrolshootinggalleryEffect': 'tikcontrolshootinggallery',
    'tikcontrolskyrunnerEffect': 'tikcontrolskyrunner',
    'tikcontrolsurvivalEffect': 'tikcontrolsurvival',
    'tikcontroltowerdefenseEffect': 'tikcontroltowerdefense',
    'tikcontroldiamondchallengeEffect': 'tikcontroldiamondchallenge',
    'twopointheditCommand': 'twopointedit',
    'twopointeditCommand': 'twopointedit',
    'ghostwatchersCommand': 'ghostwatchers',
    'hytaleEffect':         'hytale-survival',
    'subnautica':           'subnautica',
    'subnautica2':          'subnautica2',
    'prison':               'gtav',
    'train':                'gtav',
    'race':                 'gtav',
    'my-suika':             'mysuika',
};

const GAME_ID_ALIASES = {
    'hytale': 'hytale-survival',
};

// Módulos actualmente cargados e inicializados
const activeModules = new Map();

// Módulos que NO deben cerrarse al cambiar de perfil
// (se cargan en main.js como servicios permanentes, re-inicializarlos rompería IPC)
const PERMANENT_MODULES = new Set(['supermarket']);

// Game modules register global Electron IPC handlers. Unloading them on profile
// changes leaves those handlers behind, so a later reload can fail while trying
// to register the same channels again. Keep loaded modules alive during the app
// session and only close them on shutdown.
const STICKY_MODULES = new Set(Object.keys(MODULE_PATHS));

// Referencia a mainWindow
let mainWindowRef = null;

// Cache de juegos disponibles (del manifest de AWS)
let availableGamesCache = null;

/**
 * Obtiene la lista de IDs de juegos disponibles desde AWS
 * Usado para detectar dinámicamente nuevos juegos
 */
async function getAvailableGameIds() {
    try {
        const gamesCloudService = require('../modules/auth/gamesCloudService');
        const games = await gamesCloudService.getAvailableGames();
        availableGamesCache = games;
        return new Set(games.map(g => g.id));
    } catch (e) {
        // Fallback a lista local si AWS falla
        return new Set(Object.keys(MODULE_PATHS));
    }
}

/**
 * Obtiene el path del módulo para un gameId
 * Primero busca en el mapeo local, luego intenta convención de nombres
 */
function getModulePath(gameId) {
    // Buscar en mapeo conocido
    if (MODULE_PATHS[gameId]) {
        return MODULE_PATHS[gameId];
    }

    // Intentar convención: ./games/<gameId>.js
    const conventionPath = `./games/${gameId}.js`;
    try {
        require.resolve(conventionPath);
        logger.info('GameModuleManager', `📦 Nuevo juego detectado: ${gameId} → ${conventionPath}`);
        MODULE_PATHS[gameId] = conventionPath; // Añadir al cache
        return conventionPath;
    } catch (e) {
        // Módulo no existe localmente
        return null;
    }
}

/**
 * Detecta qué juegos están configurados en las acciones de un perfil
 * @param {object} profileData - El campo .data del perfil
 * @returns {Set<string>} Set de gameIds detectados
 */
async function detectGamesInProfile(profileData) {
    const games = new Set();

    if (!profileData || !profileData.actions) {
        return games;
    }

    // Obtener lista de juegos válidos desde AWS + MODULE_PATHS locales
    const validGameIds = await getAvailableGameIds();
    // También incluir todos los gameIds de MODULE_PATHS por si AWS falla parcialmente
    for (const gId of Object.keys(MODULE_PATHS)) {
        validGameIds.add(gId);
    }

    for (const action of profileData.actions) {
        if (!action.options) continue;

        for (const key of Object.keys(action.options)) {
            const val = action.options[key];
            if (val === undefined || val === '') continue;

            // 1. Match directo: la key es un gameId válido (repo, schedule1, bloonstd6, etc.)
            if (validGameIds.has(key)) {
                games.add(key);
            }

            // 2. ✅ FIX CRITICO: Match por optionKey → gameId
            //    Juegos como ror2 guardan su opción como "ror2Effect" (no como "ror2")
            //    Sin este mapeo, el módulo ror2.js NUNCA se carga y los comandos fallan
            if (OPTION_KEY_TO_GAME_ID[key]) {
                games.add(OPTION_KEY_TO_GAME_ID[key]);
            }

            // 3. Match por _awsGameId: juegos genéricos de AWS
            if (key === '_awsGameId' && typeof val === 'string' && val !== '') {
                games.add(val);
                // Si el _awsGameId mapea a un módulo padre (ej: prison → gtav), cargarlo también
                if (OPTION_KEY_TO_GAME_ID[val]) {
                    games.add(OPTION_KEY_TO_GAME_ID[val]);
                }
            }
        }

        // Caso especial: gtavCommandOptions indica GTA V
        if (action.options.gtavCommandOptions && Object.keys(action.options.gtavCommandOptions).length > 0) {
            games.add('gtav');
        }

        // Caso especial: gtavCommand directo indica GTA V
        if (action.options.gtavCommand && action.options.gtavCommand !== '') {
            games.add('gtav');
        }

        // Caso especial: gameEffectOptions puede indicar un juego genérico
        if (action.options.gameEffectOptions && action.options.gameEffectOptions.gameId) {
            games.add(action.options.gameEffectOptions.gameId);
        }
    }

    // ✅ Detectar juegos desde gamingCommands (pestaña Gaming)
    if (Array.isArray(profileData.gamingCommands)) {
        for (const gc of profileData.gamingCommands) {
            if (!gc || !gc.active || !gc.gameId) continue;
            const gId = gc.gameId;
            if (validGameIds.has(gId)) {
                games.add(gId);
            }
            if (OPTION_KEY_TO_GAME_ID[gId]) {
                games.add(OPTION_KEY_TO_GAME_ID[gId]);
            }
        }
    }

    return games;
}

/**
 * Obtiene el nombre legible de un juego
 */
async function getGameName(gameId) {
    if (availableGamesCache) {
        const game = availableGamesCache.find(g => g.id === gameId);
        if (game) return game.name;
    }
    // Fallback: capitalizar ID
    return gameId.charAt(0).toUpperCase() + gameId.slice(1);
}

/**
 * Inicializa los módulos necesarios para un perfil
 * @param {object} profileData - El campo .data del perfil
 * @param {BrowserWindow} mainWindow - La ventana principal
 */
let _initDebounceTimer = null;
let _lastInitSignature = '';

async function initializeForProfile(profileData, mainWindow) {
    mainWindowRef = mainWindow;

    const neededGames = await detectGamesInProfile(profileData);

    // Debounce: skip if same games were just initialized
    const sig = [...neededGames].sort().join(',');
    if (sig === _lastInitSignature && activeModules.size > 0) return;
    _lastInitSignature = sig;

    // Resolve all game IDs to canonical module IDs
    const resolvedNeeded = new Set();
    for (const gId of neededGames) {
        resolvedNeeded.add(resolveGameId(gId));
    }

    const gameNames = await Promise.all([...resolvedNeeded].map(id => getGameName(id)));
    logger.info('GameModuleManager', `🎮 Juegos detectados en perfil: ${resolvedNeeded.size > 0 ? gameNames.join(', ') : 'ninguno'}`);

    // 1. Cerrar módulos que ya no se necesitan
    const gamesToClose = [];
    for (const [gameId] of activeModules) {
        if (!resolvedNeeded.has(gameId)) {
            gamesToClose.push(gameId);
        }
    }

    for (const gameId of gamesToClose) {
        await closeModule(gameId);
    }

    // 2. Abrir módulos que ahora se necesitan
    for (const gameId of resolvedNeeded) {
        if (!activeModules.has(gameId)) {
            await loadModule(gameId, mainWindow);
        }
    }

    logger.info('GameModuleManager', `✅ Módulos activos: ${activeModules.size > 0 ? [...activeModules.keys()].join(', ') : 'ninguno'}`);
}

/**
 * Resuelve un gameId a su ID canónico de módulo (ej: 'my-suika' → 'mysuika')
 */
function resolveGameId(gameId) {
    const mappedId = OPTION_KEY_TO_GAME_ID[gameId] || gameId;
    return GAME_ID_ALIASES[mappedId] || mappedId;
}

/**
 * Carga e inicializa un módulo de juego
 */
async function loadModule(gameId, mainWindow) {
    const resolvedId = resolveGameId(gameId);

    if (activeModules.has(resolvedId)) {
        return true;
    }

    const modulePath = getModulePath(resolvedId);

    if (!modulePath) {
        if (!loadModule._warned) loadModule._warned = new Set();
        if (!loadModule._warned.has(resolvedId)) {
            loadModule._warned.add(resolvedId);
            logger.warn('GameModuleManager', `⚠️ Módulo no encontrado para: ${gameId}`);
        }
        return false;
    }

    try {
        const gameName = await getGameName(resolvedId);
        logger.info('GameModuleManager', `📦 Cargando módulo: ${gameName}`);

        const gameModule = require(modulePath);

        if (typeof gameModule.init === 'function') {
            gameModule.init(mainWindow);
        } else if (typeof gameModule.initialize === 'function') {
            gameModule.initialize(mainWindow);
        }

        activeModules.set(resolvedId, gameModule);
        logger.info('GameModuleManager', `✅ ${gameName} inicializado`);
        return true;
    } catch (e) {
        logger.error('GameModuleManager', `❌ Error cargando ${resolvedId}:`, e.message);
        return false;
    }
}

/**
 * Cierra y limpia un módulo de juego
 */
async function closeModule(gameId, options = {}) {
    const force = !!options.force;

    if (!force && STICKY_MODULES.has(gameId)) {
        logger.info('GameModuleManager', `Modulo ${gameId} queda cargado para conservar IPC`);
        return;
    }

    // ✅ No cerrar módulos permanentes (cargados por main.js como servicios)
    // Re-inicializarlos rompería los IPC handlers ya registrados
    if (!force && PERMANENT_MODULES.has(gameId)) {
        return;
    }

    const module = activeModules.get(gameId);
    if (!module) return;

    const gameName = await getGameName(gameId);

    try {
        logger.info('GameModuleManager', `🛑 Cerrando módulo: ${gameName}`);

        // Llamar cleanup/stop si existe
        if (typeof module.cleanup === 'function') {
            module.cleanup();
        } else if (typeof module.stop === 'function') {
            module.stop();
        } else if (typeof module.destroy === 'function') {
            module.destroy();
        }

        activeModules.delete(gameId);

        // Eliminar del cache de require para poder recargarlo después
        const modulePath = getModulePath(gameId);
        if (modulePath) {
            try {
                const resolvedPath = require.resolve(modulePath);
                delete require.cache[resolvedPath];
            } catch (e) {
                // Ignorar errores de resolución
            }
        }

        logger.info('GameModuleManager', `✅ ${gameName} cerrado`);
    } catch (e) {
        logger.error('GameModuleManager', `❌ Error cerrando ${gameName}:`, e.message);
    }
}

/**
 * Cierra todos los módulos activos (para shutdown)
 */
async function shutdownAll() {
    logger.info('GameModuleManager', `🛑 Cerrando todos los módulos (${activeModules.size})...`);

    for (const gameId of [...activeModules.keys()]) {
        await closeModule(gameId, { force: true });
    }

    logger.info('GameModuleManager', '✅ Todos los módulos cerrados');
}

/**
 * Obtiene un módulo activo por su gameId
 */
function getModule(gameId) {
    return activeModules.get(resolveGameId(gameId));
}

/**
 * Verifica si un módulo está activo
 */
function isModuleActive(gameId) {
    return activeModules.has(resolveGameId(gameId));
}

/**
 * Obtiene la lista de módulos activos
 */
function getActiveModules() {
    return [...activeModules.keys()];
}

/**
 * ✅ Carga bajo demanda: asegura que un módulo esté cargado.
 * Usado por la UI cuando el usuario selecciona un juego en el editor de acciones
 * ANTES de guardar la acción (el módulo aún no está en el perfil).
 * También debe invocarse antes de ejecutar comandos de gaming (IPC `gameModuleManager:ensureLoaded`
 * vía `tikcontrol.ensureGameModuleLoaded`) — p. ej. desde `executeGameCommand` en
 * `renderer/tabs/gaming/index.js` cuando un evento de TikTok dispara un comando sin haber
 * abierto la pestaña Gaming (el módulo aún no estaba en el mapa de `initializeForProfile`).
 * @param {string} gameId - ID del juego a cargar
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function ensureModuleLoaded(gameId) {
    const resolvedId = resolveGameId(gameId);
    // Si ya está activo, no hacer nada
    if (activeModules.has(resolvedId)) {
        return { success: true, alreadyLoaded: true };
    }

    // ✅ Detectar módulos permanentes cargados externamente (ej: supermarket cargado por main.js).
    // Para el resto, aunque esté en require.cache, debe pasar por loadModule() para registrar IPC.
    const modulePath = getModulePath(resolvedId);
    if (modulePath && PERMANENT_MODULES.has(resolvedId)) {
        try {
            const resolvedPath = require.resolve(modulePath);
            if (require.cache[resolvedPath]) {
                // Módulo ya fue cargado por otro mecanismo (main.js)
                // Registrarlo en activeModules sin re-inicializar
                activeModules.set(resolvedId, require.cache[resolvedPath].exports);
                logger.info('GameModuleManager', `✅ Módulo ${resolvedId} detectado en cache (cargado externamente)`);
                return { success: true, alreadyLoaded: true };
            }
        } catch (e) {
            // require.resolve falló, el módulo no existe en cache
        }
    }

    let mainWindow = mainWindowRef;
    if (!mainWindow) {
        // Intentar obtener mainWindow si no fue establecida por initializeForProfile
        try {
            const { getMainWindow } = require('../core/window');
            mainWindow = getMainWindow();
            if (mainWindow) mainWindowRef = mainWindow;
        } catch (_) {}
    }
    if (!mainWindow) {
        logger.warn('GameModuleManager', `⚠️ ensureModuleLoaded: mainWindow no disponible`);
        return { success: false, error: 'mainWindow not available' };
    }

    const result = await loadModule(resolvedId, mainWindow);
    if (result) {
        logger.info('GameModuleManager', `✅ Módulo ${resolvedId} cargado bajo demanda`);
        return { success: true };
    } else {
        return { success: false, error: `No se pudo cargar el módulo ${resolvedId}` };
    }
}

/**
 * Registra los IPC handlers del GameModuleManager.
 * Debe llamarse una vez desde main.js.
 */
function setupIPCHandlers() {
    const { ipcMain } = require('electron');

    ipcMain.handle('gameModuleManager:ensureLoaded', async (event, gameId) => {
        try {
            return await ensureModuleLoaded(gameId);
        } catch (e) {
            logger.error('GameModuleManager', `❌ Error en ensureLoaded(${gameId}):`, e.message);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('gameModuleManager:checkAllGamesStatus', () => {
        try {
            const {
                checkAllGamesStatus,
                GAME_REGISTRY,
                isTikControlGeometryDashModInstalled
            } = require('./modules/steamDetect');
            const fs = require('fs');
            const path = require('path');
            const { app } = require('electron');

            const results = checkAllGamesStatus();

            const userData = app.getPath('userData');
            const configFiles = [
                path.join(userData, 'config.json'),
                path.join(userData, 'electron-config.json'),
            ];

            const configs = {};
            for (const cf of configFiles) {
                try {
                    if (fs.existsSync(cf)) Object.assign(configs, JSON.parse(fs.readFileSync(cf, 'utf8')));
                } catch (_) {}
            }

            const extraConfigs = ['overcooked2-config.json', 're4-config.json'];
            for (const ec of extraConfigs) {
                try {
                    const ecPath = path.join(userData, ec);
                    if (fs.existsSync(ecPath)) {
                        const data = JSON.parse(fs.readFileSync(ecPath, 'utf8'));
                        const prefix = ec.replace('-config.json', '');
                        if (data.gamePath) configs[`${prefix}_game_path`] = data.gamePath;
                    }
                } catch (_) {}
            }

            for (const [gameId, info] of Object.entries(GAME_REGISTRY)) {
                if (results[gameId]?.gameFound) continue;

                let savedPath = configs[`${gameId}_game_path`] || null;
                if (!savedPath) {
                    for (const key of Object.keys(configs)) {
                        if (key.startsWith(`${gameId}_game_path`)) {
                            savedPath = configs[key]; break;
                        }
                    }
                }
                if (!savedPath) continue;
                if (savedPath.toLowerCase().endsWith('.exe')) savedPath = path.dirname(savedPath);
                if (!fs.existsSync(path.join(savedPath, info.exe))) continue;

                let modInstalled = false;
                if (gameId === 'geometrydash') {
                    modInstalled = isTikControlGeometryDashModInstalled(savedPath);
                } else if (info.modFiles.length > 0) {
                    modInstalled = info.modFiles.every(f => fs.existsSync(path.join(savedPath, f)));
                }

                results[gameId] = { gamePath: savedPath, gameFound: true, modInstalled };
            }

            return results;
        } catch (e) {
            logger.error('GameModuleManager', `❌ Error en checkAllGamesStatus:`, e.message);
            return {};
        }
    });

    logger.info('GameModuleManager', '✅ IPC handlers registrados');
}

module.exports = {
    initializeForProfile,
    shutdownAll,
    getModule,
    isModuleActive,
    getActiveModules,
    detectGamesInProfile,
    getAvailableGameIds,
    ensureModuleLoaded,
    setupIPCHandlers,
};
