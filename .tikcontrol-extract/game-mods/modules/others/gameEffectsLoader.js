// Game Effects Loader - Carga efectos de juegos desde archivos JSON
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class GameEffectsLoader {
  constructor() {
    this.effectsCache = new Map();
  }

  /**
   * Carga efectos desde un archivo JSON
   * @param {string} gameName - Nombre del juego
   * @param {string} jsonFileName - Nombre del archivo JSON
   * @returns {Object} Objeto con efectos y metadata
   */
  loadEffects(gameName, jsonFileName) {
    // Si ya está en caché, devolverlo
    if (this.effectsCache.has(gameName)) {
      return this.effectsCache.get(gameName);
    }

    try {
      const jsonPath = path.join(__dirname, '../../renderer/data', jsonFileName);
      
      if (!fs.existsSync(jsonPath)) {
        logger.warn('GameEffectsLoader', `Archivo no encontrado: ${jsonPath}`);
        return { success: false, effects: [], error: 'File not found' };
      }

      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      
      // Convertir effects de objeto a array si es necesario
      let effectsArray = [];
      if (data.effects) {
        if (Array.isArray(data.effects)) {
          // Ya es un array
          effectsArray = data.effects;
        } else if (typeof data.effects === 'object') {
          // Es un objeto, convertir a array
          effectsArray = Object.keys(data.effects).map(key => {
            const effect = { id: key, ...data.effects[key] };
            
            // Si 'name' es un objeto con traducciones, extraer el nombre en inglés por defecto
            if (effect.name && typeof effect.name === 'object') {
              effect.name = effect.name.en || effect.name.es || Object.values(effect.name)[0] || key;
            }
            
            // Si 'description' es un objeto con traducciones, extraer la descripción en inglés
            if (effect.description && typeof effect.description === 'object') {
              effect.description = effect.description.en || effect.description.es || Object.values(effect.description)[0] || '';
            }
            
            return effect;
          });
        }
      }
      
      const result = {
        success: true,
        effects: effectsArray,
        categories: data.categories || {},
        game: data.game || gameName,
        gameID: data.gameID || gameName,
        platform: data.platform || 'PC',
        method: data.method || 'HTTP'
      };

      // Guardar en caché
      this.effectsCache.set(gameName, result);
      
      logger.info('GameEffectsLoader', `Efectos cargados para ${gameName}: ${result.effects.length} efectos`);
      return result;

    } catch (e) {
      logger.error('GameEffectsLoader', `Error cargando efectos de ${gameName}:`, e);
      return { success: false, effects: [], error: e.message };
    }
  }

  /**
   * Limpia la caché de un juego específico o toda la caché
   * @param {string} gameName - Nombre del juego (opcional)
   */
  clearCache(gameName = null) {
    if (gameName) {
      this.effectsCache.delete(gameName);
      logger.info('GameEffectsLoader', `Caché limpiada para ${gameName}`);
    } else {
      this.effectsCache.clear();
      logger.info('GameEffectsLoader', 'Toda la caché de juegos limpiada');
    }
  }

  /**
   * Obtiene efectos de Risk of Rain 2
   */
  getRor2Effects() {
    return this.loadEffects('RoR2', 'ror2-effects.json');
  }

  /**
   * Obtiene efectos de Tricky Towers
   */
  getTrickyTowersEffects() {
    return this.loadEffects('TrickyTowers', 'trickytowers-effects.json');
  }

  /**
   * Obtiene efectos de Lethal Company
   */
  getLethalCompanyEffects() {
    return this.loadEffects('LethalCompany', 'lethalcompany-effects.json');
  }

  /**
   * Obtiene efectos de Megabonk
   */
  getMegabonkEffects() {
    return this.loadEffects('Megabonk', 'megabonk.json');
  }

  /**
   * Obtiene efectos de Muck
   */
  getMuckEffects() {
    return this.loadEffects('Muck', 'muck.json');
  }
}

// Singleton
const gameEffectsLoader = new GameEffectsLoader();

module.exports = gameEffectsLoader;

