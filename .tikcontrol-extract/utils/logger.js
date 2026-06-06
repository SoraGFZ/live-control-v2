// Sistema de Logging Centralizado para TikControl
// Versión: 1.0.0

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  constructor() {
    // Default: WARN (errores + warnings). Override con LOG_LEVEL=INFO para debug verbose.
    const envLevel = process.env.LOG_LEVEL || 'WARN';
    this.level = LOG_LEVELS[envLevel.toUpperCase()] || LOG_LEVELS.WARN;

    this.silent = process.env.LOG_SILENT === 'true';
    this._bootMessages = [];
    this._bootDone = false;
    this._telemetry = null; // lazy-loaded, evita ciclo require al arrancar
  }

  _emitToTelemetry(level, tag, args) {
    try {
      if (this._telemetry === null) {
        try {
          this._telemetry = require('../server/mcp-admin/telemetry');
        } catch (_) {
          this._telemetry = false; // marcar como no disponible
        }
      }
      if (!this._telemetry) return;
      const levelStr = Object.keys(LOG_LEVELS).find((k) => LOG_LEVELS[k] === level) || 'INFO';
      const message = args
        .map((a) => {
          if (a instanceof Error) return a.stack || a.message;
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch (_) { return String(a); }
          }
          return String(a);
        })
        .join(' ')
        .slice(0, 2000);
      this._telemetry.recordLog({ level: levelStr, tag, message });
    } catch (_) { /* swallow: telemetry must never break logging */ }
  }

  // Collect boot messages, then print a single summary line
  boot(msg) {
    if (!this._bootDone) this._bootMessages.push(msg);
  }

  bootDone(version, startTime) {
    this._bootDone = true;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const warns = this._bootMessages.filter(m => m.startsWith('⚠'));
    console.log(`\n  ✅ TikControl v${version} listo (${elapsed}s)${warns.length ? ` — ${warns.length} warnings` : ''}\n`);
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    } else if (typeof level === 'number') {
      this.level = level;
    }
  }

  setSilent(silent) {
    this.silent = !!silent;
  }

  _shouldLog(level) {
    return !this.silent && this.level <= level;
  }

  _formatMessage(level, tag, ...args) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const levelStr = Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === level);
    return `[${timestamp}] [${levelStr}] [${tag}]`;
  }

  debug(tag, ...args) {
    this._emitToTelemetry(LOG_LEVELS.DEBUG, tag, args);
    if (this._shouldLog(LOG_LEVELS.DEBUG)) {
      console.log(this._formatMessage(LOG_LEVELS.DEBUG, tag), ...args);
    }
  }

  info(tag, ...args) {
    this._emitToTelemetry(LOG_LEVELS.INFO, tag, args);
    if (this._shouldLog(LOG_LEVELS.INFO)) {
      console.log(this._formatMessage(LOG_LEVELS.INFO, tag), ...args);
    }
  }

  warn(tag, ...args) {
    this._emitToTelemetry(LOG_LEVELS.WARN, tag, args);
    if (this._shouldLog(LOG_LEVELS.WARN)) {
      console.warn(this._formatMessage(LOG_LEVELS.WARN, tag), ...args);
    }
  }

  error(tag, ...args) {
    this._emitToTelemetry(LOG_LEVELS.ERROR, tag, args);
    if (this._shouldLog(LOG_LEVELS.ERROR)) {
      console.error(this._formatMessage(LOG_LEVELS.ERROR, tag), ...args);
    }
  }

  // Métodos de conveniencia con tags predefinidos
  tiktok(...args) { this.info('TikTok', ...args); }
  tts(...args) { this.info('TTS', ...args); }
  obs(...args) { this.info('OBS', ...args); }
  widget(...args) { this.info('Widget', ...args); }
  game(...args) { this.info('Game', ...args); }
  server(...args) { this.info('Server', ...args); }
  ipc(...args) { this.debug('IPC', ...args); }
}

// Singleton
const logger = new Logger();

module.exports = logger;


