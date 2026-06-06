// Minecraft Server Installer - Instala un servidor de Minecraft con Paper y plugins
const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('../../../utils/logger');
const AdmZip = require('adm-zip');

/**
 * Instala un servidor de Minecraft con Paper y plugins opcionales
 * @param {Object} options - Opciones de instalación
 * @param {string} options.version - Versión de Minecraft (ej: '1.21.1')
 * @param {string} options.ram - RAM asignada (ej: '2G', '4G')
 * @param {string} options.installPath - Ruta donde instalar el servidor
 * @param {Array<string>} options.plugins - Lista de plugins a instalar (ej: ['TNTBOX', 'ServerTap'])
 * @returns {Promise<Object>} Resultado de la instalación
 */
async function installMinecraftServer(options) {
  const { version, ram, installPath, plugins = [] } = options;
  
  logger.info('MinecraftInstaller', `Iniciando instalación: ${version} con ${ram} RAM en ${installPath}`);
  
  try {
    // 1. Crear directorio si no existe
    if (!fs.existsSync(installPath)) {
      fs.mkdirSync(installPath, { recursive: true });
      logger.info('MinecraftInstaller', `Directorio creado: ${installPath}`);
    }
    
    // 2. Descargar Paper
    const paperJarPath = await downloadPaper(version, installPath);
    logger.info('MinecraftInstaller', `Paper descargado: ${paperJarPath}`);
    
    // 3. Crear scripts de inicio
    createStartScripts(installPath, ram, paperJarPath);
    logger.info('MinecraftInstaller', 'Scripts de inicio creados');
    
    // 4. Crear directorio de plugins
    const pluginsDir = path.join(installPath, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
    }
    
    // 5. Aceptar EULA
    const eulaPath = path.join(installPath, 'eula.txt');
    fs.writeFileSync(eulaPath, 'eula=true\n', 'utf8');
    logger.info('MinecraftInstaller', 'EULA aceptado');
    
    // 6. Instalar plugins solicitados
    const installedPlugins = [];
    for (const plugin of plugins) {
      try {
        await installPlugin(plugin, pluginsDir);
        installedPlugins.push(plugin);
        logger.info('MinecraftInstaller', `Plugin instalado: ${plugin}`);
      } catch (e) {
        logger.warn('MinecraftInstaller', `Error instalando ${plugin}:`, e.message);
      }
    }
    
    return {
      success: true,
      path: installPath,
      paperJar: paperJarPath,
      plugins: installedPlugins,
      message: `Servidor instalado correctamente en ${installPath}`
    };
    
  } catch (e) {
    logger.error('MinecraftInstaller', 'Error en instalación:', e);
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * Descarga Paper para la versión especificada
 * @param {string} version - Versión de Minecraft
 * @param {string} installPath - Ruta de instalación
 * @returns {Promise<string>} Ruta del JAR descargado
 */
async function downloadPaper(version, installPath) {
  // Para simplificar, vamos a descargar el último build de Paper para la versión especificada
  // API de Paper: https://api.papermc.io/v2/projects/paper/versions/1.21.1
  
  return new Promise((resolve, reject) => {
    const apiUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}`;
    
    https.get(apiUrl, (res) => {
      let data = '';
      
      res.on('data', chunk => { data += chunk; });
      
      res.on('end', () => {
        try {
          const versionInfo = JSON.parse(data);
          const builds = versionInfo.builds;
          
          if (!builds || builds.length === 0) {
            return reject(new Error(`No hay builds disponibles para ${version}`));
          }
          
          // Obtener el último build
          const latestBuild = builds[builds.length - 1];
          
          // Descargar el JAR
          const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/paper-${version}-${latestBuild}.jar`;
          const jarPath = path.join(installPath, `paper-${version}.jar`);
          
          logger.info('MinecraftInstaller', `Descargando Paper desde: ${downloadUrl}`);
          
          const file = fs.createWriteStream(jarPath);
          
          https.get(downloadUrl, (jarRes) => {
            jarRes.pipe(file);
            
            file.on('finish', () => {
              file.close();
              resolve(jarPath);
            });
          }).on('error', (err) => {
            fs.unlinkSync(jarPath);
            reject(err);
          });
          
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Crea los scripts de inicio para Windows
 * @param {string} installPath - Ruta de instalación
 * @param {string} ram - RAM asignada
 * @param {string} jarPath - Ruta del JAR de Paper
 */
function createStartScripts(installPath, ram, jarPath) {
  const jarName = path.basename(jarPath);
  
  // Script para Windows
  const batContent = `@echo off
title Minecraft Server ${ram}
java -Xmx${ram} -Xms${ram} -jar ${jarName} nogui
pause
`;
  
  const batPath = path.join(installPath, 'START_SERVER.bat');
  fs.writeFileSync(batPath, batContent, 'utf8');
  
  // Script para Linux/Mac (opcional)
  const shContent = `#!/bin/bash
java -Xmx${ram} -Xms${ram} -jar ${jarName} nogui
`;
  
  const shPath = path.join(installPath, 'start.sh');
  fs.writeFileSync(shPath, shContent, 'utf8');
  
  // Dar permisos de ejecución en Linux/Mac
  try {
    fs.chmodSync(shPath, '755');
  } catch (e) {
    // En Windows esto fallará, pero no es problema
  }
}

/**
 * Instala un plugin en el servidor
 * @param {string} pluginName - Nombre del plugin
 * @param {string} pluginsDir - Directorio de plugins
 */
async function installPlugin(pluginName, pluginsDir) {
  // Aquí deberías tener lógica para descargar plugins específicos
  // Por ahora, vamos a buscar en la carpeta local de plugins
  
  const localPluginsPath = path.join(__dirname, '..', 'data', 'plugins', `${pluginName}.jar`);
  
  if (fs.existsSync(localPluginsPath)) {
    const dest = path.join(pluginsDir, `${pluginName}.jar`);
    fs.copyFileSync(localPluginsPath, dest);
    logger.info('MinecraftInstaller', `Plugin ${pluginName} copiado desde local`);
  } else {
    logger.warn('MinecraftInstaller', `Plugin ${pluginName} no encontrado localmente`);
    // Aquí podrías agregar lógica para descargar desde URLs específicas
  }
}

/**
 * Instala el plugin TNTBOX en un servidor existente
 * @param {Object} options - Opciones de instalación
 * @param {string} options.serverPath - Ruta del servidor
 * @param {boolean} options.installServerTap - Si debe instalar ServerTap también
 * @returns {Promise<Object>} Resultado de la instalación
 */
async function installTNTBOXPlugin(options) {
  const { serverPath, installServerTap = true } = options;
  
  logger.info('MinecraftInstaller', `Instalando TNTBOX en: ${serverPath}`);
  
  try {
    // Verificar que el servidor existe
    if (!fs.existsSync(serverPath)) {
      throw new Error('La ruta del servidor no existe');
    }
    
    // Verificar que existe la carpeta plugins
    const pluginsDir = path.join(serverPath, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
      logger.info('MinecraftInstaller', 'Carpeta plugins creada');
    }
    
    const TNTBOX_URL = 'https://storage.tikcontrol.live/games/tikcontrol-cubo/TNTBOX-3.0.0.jar';
    const tntboxDest = path.join(pluginsDir, 'TNTBOX-3.0.0.jar');

    logger.info('MinecraftInstaller', 'Descargando TNTBOX desde AWS...');
    await downloadFile(TNTBOX_URL, tntboxDest);
    logger.info('MinecraftInstaller', 'TNTBOX.jar descargado correctamente');
    
    let servertapInstalled = false;
    
    // Instalar ServerTap si se solicitó
    if (installServerTap) {
      try {
        logger.info('MinecraftInstaller', 'Descargando ServerTap v0.6.1...');
        
        // URL de la última versión de ServerTap
        const servertapUrl = 'https://github.com/servertap-io/servertap/releases/download/v0.6.1/ServerTap-0.6.1.jar';
        const servertapDest = path.join(pluginsDir, 'ServerTap-0.6.1.jar');
        
        // ✅ FIX v1.10.511: Descargar con User-Agent y manejo de redirects de GitHub
        await new Promise((resolve, reject) => {
          let fileStream = null;
          
          const downloadWithRedirect = (url) => {
            // Cerrar stream anterior si existe
            if (fileStream) {
              fileStream.close();
              fileStream = null;
            }
            
            // Crear nuevo stream para esta descarga
            fileStream = fs.createWriteStream(servertapDest);
            
            https.get(url, {
              headers: { 'User-Agent': 'TikControl' }
            }, (response) => {
              // Manejar redirects de GitHub (302/301)
              if (response.statusCode === 302 || response.statusCode === 301) {
                fileStream.close();
                try { fs.unlinkSync(servertapDest); } catch {}
                logger.info('MinecraftInstaller', `Siguiendo redirect a: ${response.headers.location}`);
                // ✅ CRÍTICO: Hacer la llamada recursiva después de cerrar el stream
                setImmediate(() => downloadWithRedirect(response.headers.location));
                return;
              }
              
              if (response.statusCode !== 200) {
                fileStream.close();
                try { fs.unlinkSync(servertapDest); } catch {}
                return reject(new Error(`HTTP ${response.statusCode}`));
              }
              
              // Descargar archivo
              response.pipe(fileStream);
              
              fileStream.on('finish', () => {
                fileStream.close();
                logger.info('MinecraftInstaller', 'ServerTap v0.6.1 descargado correctamente');
                resolve();
              });
              
              fileStream.on('error', (err) => {
                fileStream.close();
                try { fs.unlinkSync(servertapDest); } catch {}
                reject(err);
              });
            }).on('error', (err) => {
              if (fileStream) {
                fileStream.close();
              }
              try { fs.unlinkSync(servertapDest); } catch {}
              reject(err);
            });
          };
          
          downloadWithRedirect(servertapUrl);
        });
        
        servertapInstalled = true;
        logger.info('MinecraftInstaller', 'ServerTap instalado correctamente');
      } catch (e) {
        logger.warn('MinecraftInstaller', 'Error instalando ServerTap:', e.message);
        // No es crítico, TNTBOX puede funcionar sin ServerTap
      }
    }
    
    return {
      success: true,
      path: tntboxDest,
      servertapInstalled: servertapInstalled,
      message: 'TNTBOX instalado correctamente'
    };
    
  } catch (e) {
    logger.error('MinecraftInstaller', 'Error instalando TNTBOX:', e);
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * Descarga un archivo desde una URL
 * @param {string} url - URL del archivo
 * @param {string} dest - Ruta de destino
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      // Manejar redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

module.exports = {
  installMinecraftServer,
  installTNTBOXPlugin
};

