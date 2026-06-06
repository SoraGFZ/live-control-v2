/**
 * Shared Steam game detection utility.
 * Finds installed Steam games by checking common paths, registry, and libraryfolders.vdf.
 * Also provides centralized mod status checking for all games.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COMMON_STEAM_BASES = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common',
    'C:\\Program Files\\Steam\\steamapps\\common',
    'D:\\Steam\\steamapps\\common',
    'D:\\SteamLibrary\\steamapps\\common',
    'E:\\Steam\\steamapps\\common',
    'E:\\SteamLibrary\\steamapps\\common',
    'F:\\Steam\\steamapps\\common',
    'F:\\SteamLibrary\\steamapps\\common',
    'G:\\Steam\\steamapps\\common',
    'G:\\SteamLibrary\\steamapps\\common',
];

/**
 * Registry of known games with their Steam folder, exe, and mod file paths.
 * modFiles are checked relative to the game folder (not the exe).
 */
const GAME_REGISTRY = {
    'gtav':             { folder: 'Grand Theft Auto V',                          exe: 'GTA5.exe',                modFiles: [] },
    'mysuika':          { folder: 'MySuika',                                     exe: 'MySuika.exe',             modFiles: ['MelonLoader', 'version.dll', 'Mods/TikControl.dll'] },
    'schedule1':        { folder: 'Schedule I',                                  exe: 'Schedule I.exe',          modFiles: ['MelonLoader', 'version.dll', 'Mods/TikControl.dll'] },
    'bloonstd6':        { folder: 'BloonsTD6',                                   exe: 'BloonsTD6.exe',           modFiles: ['Mods/TikControl.dll', 'MelonLoader'] },
    'roadsideresearch': { folder: 'Roadside Research',                           exe: 'Roadside Research.exe',   modFiles: ['Mods/TikControl_RoadsideResearch.dll', 'MelonLoader', 'version.dll'] },
    'overcooked2':      { folder: 'Overcooked! 2',                               exe: 'Overcooked2.exe',         modFiles: ['MelonLoader', 'version.dll', 'Mods/TikControl.dll'] },
    're4':              { folder: 'RESIDENT EVIL 4  BIOHAZARD RE4',              exe: 're4.exe',                 modFiles: ['Mods/TikControl.dll', 'MelonLoader'] },
    'repo':             { folder: ['REPO', 'R.E.P.O.'],                           exe: ['REPO.exe', 'R.E.P.O.exe'], modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/TikControl-repo.dll'] },
    'lethalcompany':    { folder: 'Lethal Company',                              exe: 'Lethal Company.exe',      modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/TikControlMod_LethalCompany.dll'] },
    'trickytowers':     { folder: 'TrickyTowers',                                exe: 'TrickyTowers.exe',        modFiles: ['MelonLoader', 'Mods/ML.CC.dll', 'UserLibs', 'version.dll'] },
    'megabonk':         { folder: 'Megabonk',                                    exe: 'Megabonk.exe',            modFiles: ['BepInEx', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/TikControlMod_Megabonk.dll'] },
    'muck':             { folder: 'Muck',                                        exe: 'Muck.exe',                modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/TikControlMod_Muck.dll'] },
    'ror2':             { folder: 'Risk of Rain 2',                              exe: 'Risk of Rain 2.exe',      modFiles: ['BepInEx', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/TikControl/TikControl.dll'] },
    'ranchsimulator':   { folder: 'Ranch Simulator',                             exe: 'Ranch_Simulator/Binaries/Win64/Ranch_Simulator-Win64-Shipping.exe', modFiles: [['Ranch_Simulator/Binaries/Win64/ue4ss/Mods/TikControlExplorer/Scripts/main.lua', 'Ranch_Simulator/Binaries/Win64/Mods/TikControlExplorer/Scripts/main.lua'], ['Ranch_Simulator/Binaries/Win64/ue4ss/UE4SS.dll', 'Ranch_Simulator/Binaries/Win64/UE4SS.dll']] },
    'supermarket':      { folder: 'Supermarket Together',                        exe: 'Supermarket Together.exe', modFiles: ['TikControl_SupermarketTogether/tikcontrol-supermarket-together.dll'] },
    'retrorewind':      { folder: 'RetroRewind',                                exe: 'RetroRewind\\Binaries\\Win64\\RetroRewind-Win64-Shipping.exe', modFiles: ['RetroRewind\\Binaries\\Win64\\ue4ss\\Mods\\TikControlRetroRewind\\Scripts\\main.lua'] },
    'ghostwatchers':    { folder: 'Ghost Watchers',                              exe: 'Ghost Watchers.exe',      modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/GhostWatchers_TikControl.dll'] },
    'twopointedit':     { folder: 'Two Point Hospital',                          exe: 'TPH.exe',                 modFiles: [] },
    /** modInstalled se calcula con isTikControlGeometryDashModInstalled (no solo Geode). */
    'geometrydash':     { folder: 'Geometry Dash',                               exe: 'GeometryDash.exe',        modFiles: [] },
    'rvtheryet':        { folder: 'Ride',                                          exe: 'Ride.exe',                modFiles: [] },
    'raft':             { folder: 'Raft',                                          exe: 'Raft.exe',                modFiles: ['TikControl_Raft/RaftTikTok.dll', 'winhttp.dll', 'S2E_Raft/streamtoearn.assets'] },
    'supermarketsimulator': { folder: 'Supermarket Simulator',                     exe: 'Supermarket Simulator.exe', modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/TikControl-supermarket-simulator.dll', 'BepInEx/plugins/SixLabors.ImageSharp.dll'] },
    'left4dead2':       { folder: 'Left 4 Dead 2',                                exe: 'left4dead2.exe',          modFiles: [['left4dead2/addons/sourcemod/plugins/tikcontrol_l4d2.smx', 'left4dead2/addons/sourcemod/plugins/s2e_l4d2.smx'], 'left4dead2/addons/metamod.vdf'] },
    'hades2':           { folder: 'Hades II',                                     exe: 'Ship/Hades2.exe',         modFiles: ['Content/Mods/TikControl/TikControlMod.lua', 'Ship/d3d12.dll', 'Ship/ReturnOfModding'] },
    'duckov':           { folder: 'Escape From Duckov',                           exe: 'Duckov.exe',              modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/Escape_From_Duckov.dll'] },
    'yapyap':           { folder: 'Yap Yap',                                      exe: 'yapyap.exe',              modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/YapYapMod.dll'] },
    'cardshopsimulator': { folder: 'TCG Card Shop Simulator',                      exe: 'Card Shop Simulator.exe', modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', ['BepInEx/plugins/card-shop-simulator.dll', 'BepInEx/plugins/s2e-card-shop-simulator.dll']] },
    'hksilksong':       { folder: 'Hollow Knight Silksong',                        exe: 'Hollow Knight Silksong.exe', modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/HollowKnightSillkSongMod.dll'] },
    'eggingon':         { folder: 'Egging On',                                     exe: 'Egging On.exe',           modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/egging-on.dll'] },
    'peak':             { folder: 'PEAK',                                          exe: 'PEAK.exe',                modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/PeakMod.dll', 'BepInEx/plugins/TikControlPeak.dll'] },
    'waterparksimulator': { folder: 'Waterpark Simulator',                         exe: 'WaterparkSimulator.exe',  modFiles: ['MelonLoader', 'version.dll', 'Mods/waterpark-simulator.dll'] },
    'subnautica':        { folder: 'Subnautica',                                   exe: 'Subnautica.exe',          modFiles: ['BepInEx/core', 'doorstop_config.ini', 'winhttp.dll', 'BepInEx/plugins/TikControl/TikControl.Subnautica.dll'] },
    'subnautica2':       { folder: 'Subnautica2',                                  exe: 'Subnautica2.exe',         modFiles: ['Subnautica2/Binaries/Win64/dwmapi.dll', 'Subnautica2/Binaries/Win64/ue4ss/UE4SS.dll', 'Subnautica2/Binaries/Win64/ue4ss/Mods/TikControl/Scripts/main.lua'] },
};

let _steamLibraries = null;

function getSteamLibraries() {
    if (_steamLibraries) return _steamLibraries;

    const libs = new Set(COMMON_STEAM_BASES);

    try {
        // Windows: query registry for Steam install path
        if (process.platform === 'win32') {
        const stdout = execSync(
            'reg query "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v SteamPath',
            { encoding: 'utf8', timeout: 5000 }
        );
        const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
        if (match) {
            const steamPath = match[1].trim().replace(/\//g, '\\');
            libs.add(path.join(steamPath, 'steamapps', 'common'));

            const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
            if (fs.existsSync(vdfPath)) {
                const vdf = fs.readFileSync(vdfPath, 'utf8');
                const pathMatches = vdf.match(/"path"\s+"([^"]+)"/g);
                if (pathMatches) {
                    for (const pm of pathMatches) {
                        const libPath = pm.match(/"path"\s+"([^"]+)"/)[1].replace(/\\\\/g, '\\');
                        libs.add(path.join(libPath, 'steamapps', 'common'));
                    }
                }
            }
        }
        } // end if win32
        // macOS: check common Steam install
        if (process.platform === 'darwin') {
            const steamPath = path.join(require('os').homedir(), 'Library', 'Application Support', 'Steam');
            if (fs.existsSync(steamPath)) {
                libs.add(path.join(steamPath, 'steamapps', 'common'));
            }
        }
    } catch (_) {}

    _steamLibraries = [...libs];
    return _steamLibraries;
}

function asList(value) {
    return Array.isArray(value) ? value : [value];
}

function findGamePath(folderName, exeName) {
    const bases = getSteamLibraries();
    for (const base of bases) {
        for (const folder of asList(folderName)) {
            const candidate = path.join(base, folder);
            for (const exe of asList(exeName)) {
                if (fs.existsSync(path.join(candidate, exe))) {
                    return candidate;
                }
            }
        }
    }
    return null;
}

function isValidGamePath(gamePath, exeName) {
    return !!gamePath && asList(exeName).some(exe => fs.existsSync(path.join(gamePath, exe)));
}

function resolveDir(gamePath) {
    if (!gamePath) return null;
    if (gamePath.toLowerCase().endsWith('.exe')) return path.dirname(gamePath);
    return gamePath;
}

/** Marcador escrito al instalar desde TikControl; coincide con desinstalación. */
const GD_TIKCONTROL_MARKER_FILENAME = 'tikcontrol_tikcontrol.json';

/**
 * True si el mod de TikControl para GD está presente (marcador y/o .geode reconocible).
 * No confundir con "Geode instalado": sin TikControl el botón Instalar debe activarse.
 */
function isTikControlGeometryDashModInstalled(gamePathOrExe) {
    if (!gamePathOrExe) return false;
    const base = resolveDir(gamePathOrExe);
    const modsDir = path.join(base, 'geode', 'mods');
    const marker = path.join(modsDir, GD_TIKCONTROL_MARKER_FILENAME);
    if (fs.existsSync(marker)) return true;
    if (!fs.existsSync(modsDir)) return false;
    try {
        const files = fs.readdirSync(modsDir);
        return files.some(
            (f) =>
                f.endsWith('.geode') &&
                /tikcontrol\.tikcontrolgd|tikcontrol|crowd|tcgd|tc[_-]?gd|tik[\s._-]?control|geode\.tikcontrol/i.test(f)
        );
    } catch (_) {
        return false;
    }
}

function writeGeometryDashTikControlMarker(gameDir) {
    try {
        const base = resolveDir(gameDir);
        const modsDir = path.join(base, 'geode', 'mods');
        if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
        const marker = path.join(modsDir, GD_TIKCONTROL_MARKER_FILENAME);
        fs.writeFileSync(
            marker,
            JSON.stringify({ source: 'tikcontrol', v: 1, t: new Date().toISOString() }),
            'utf8'
        );
    } catch (e) {
        console.warn('[steamDetect] GD TikControl marker:', e.message);
    }
}

/**
 * Check all known games: detect paths and mod installation status.
 * Pure filesystem check - no dialogs, no module loading.
 * @returns {Object} Map of gameId → { gamePath, gameFound, modInstalled }
 */
function checkAllGamesStatus() {
    const results = {};
    for (const [gameId, info] of Object.entries(GAME_REGISTRY)) {
        const gamePath = findGamePath(info.folder, info.exe);
        const gameFound = !!gamePath;
        let modInstalled = false;
        if (gameId === 'geometrydash') {
            modInstalled = gameFound && isTikControlGeometryDashModInstalled(gamePath);
        } else if (gameFound && info.modFiles.length > 0) {
            modInstalled = info.modFiles.every(f => {
                if (Array.isArray(f)) return f.some(option => fs.existsSync(path.join(gamePath, option)));
                return fs.existsSync(path.join(gamePath, f));
            });
        }
        results[gameId] = { gamePath, gameFound, modInstalled };
    }
    return results;
}

module.exports = {
    findGamePath,
    isValidGamePath,
    resolveDir,
    getSteamLibraries,
    checkAllGamesStatus,
    GAME_REGISTRY,
    GD_TIKCONTROL_MARKER_FILENAME,
    isTikControlGeometryDashModInstalled,
    writeGeometryDashTikControlMarker
};
