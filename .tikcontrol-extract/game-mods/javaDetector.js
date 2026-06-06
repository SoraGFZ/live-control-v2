// Java Detector - Detecta si Java está instalado en el sistema
const { execSync } = require('child_process');
const logger = require('../utils/logger');

/**
 * Detecta si Java está instalado en el sistema
 * @returns {Object} { installed: boolean, version: string|null, path: string|null }
 */
function detectJava() {
  try {
    // Intentar ejecutar java -version
    const javaVersion = execSync('java -version 2>&1', { encoding: 'utf8', timeout: 5000 });
    
    // Extraer el número de versión
    const versionMatch = javaVersion.match(/version "([^"]+)"/);
    const version = versionMatch ? versionMatch[1] : 'Desconocida';
    
    // Intentar obtener la ruta de java
    let javaPath = null;
    try {
      const whereJava = process.platform === 'win32' 
        ? execSync('where java', { encoding: 'utf8', timeout: 3000 }).trim()
        : execSync('which java', { encoding: 'utf8', timeout: 3000 }).trim();
      javaPath = whereJava.split('\n')[0]; // Primera línea
    } catch (e) {
      // No se pudo obtener la ruta, pero Java está instalado
    }
    
    logger.info('JavaDetector', `✅ Java ${version} detectado`);
    
    return {
      installed: true,
      version: version,
      path: javaPath,
      suitable: isVersionSuitable(version)
    };
  } catch (e) {
    logger.warn('JavaDetector', '❌ Java no detectado en el sistema');
    
    return {
      installed: false,
      version: null,
      path: null,
      suitable: false
    };
  }
}

/**
 * Verifica si la versión de Java es adecuada para Minecraft 1.21+
 * Requiere Java 21 o superior
 * @param {string} version 
 * @returns {boolean}
 */
function isVersionSuitable(version) {
  try {
    // Extraer número de versión mayor
    const majorMatch = version.match(/^(\d+)/);
    if (!majorMatch) return false;
    
    const majorVersion = parseInt(majorMatch[1], 10);
    
    // Minecraft 1.21 requiere Java 21+
    return majorVersion >= 21;
  } catch (e) {
    return false;
  }
}

/**
 * Obtiene el link de descarga de Java
 * @returns {string}
 */
function getJavaDownloadLink() {
  // Link oficial de descarga de Java 21
  return 'https://www.oracle.com/java/technologies/downloads/#java21';
}

/**
 * Obtiene un mensaje de ayuda sobre Java
 * @param {Object} javaInfo - Resultado de detectJava()
 * @returns {string} Mensaje HTML
 */
function getHelpMessage(javaInfo) {
  if (!javaInfo.installed) {
    return `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 14px; font-weight: 600; color: #ef4444; margin-bottom: 8px;">
          ⚠️ Java no detectado
        </div>
        <div style="font-size: 12px; color: rgba(239, 68, 68, 0.8); line-height: 1.6; margin-bottom: 12px;">
          Para ejecutar el servidor de Minecraft necesitas tener <strong>Java 21</strong> o superior instalado en tu sistema.
        </div>
        <a href="${getJavaDownloadLink()}" target="_blank" style="
          display: inline-block;
          padding: 8px 16px;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          📥 Descargar Java 21
        </a>
      </div>
    `;
  } else if (!javaInfo.suitable) {
    return `
      <div style="background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 14px; font-weight: 600; color: #fbbf24; margin-bottom: 8px;">
          ⚠️ Versión de Java incompatible
        </div>
        <div style="font-size: 12px; color: rgba(251, 191, 36, 0.8); line-height: 1.6; margin-bottom: 8px;">
          Tienes <strong>Java ${javaInfo.version}</strong> instalado, pero Minecraft 1.21+ requiere <strong>Java 21 o superior</strong>.
        </div>
        <a href="${getJavaDownloadLink()}" target="_blank" style="
          display: inline-block;
          padding: 8px 16px;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          📥 Descargar Java 21
        </a>
      </div>
    `;
  } else {
    return `
      <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <div style="font-size: 13px; color: #22c55e; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">✅</span>
          <span><strong>Java ${javaInfo.version}</strong> detectado y compatible</span>
        </div>
      </div>
    `;
  }
}

module.exports = {
  detectJava,
  getJavaDownloadLink,
  getHelpMessage,
  isVersionSuitable
};

