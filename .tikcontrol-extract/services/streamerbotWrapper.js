// Wrapper CommonJS para el servicio Streamer.bot ES6
const { EventEmitter } = require('events');
const WebSocket = require('ws');

class StreamerbotService extends EventEmitter {
  constructor(){
    super();
    this.connected = false;
    this.authenticated = false;
    this.ws = null;
    // Default solicitado: puerto 8080
    this.config = { url: 'ws://127.0.0.1:8080', password: null, autoSubscribe: false };
    this.resources = { actions: [] };
    this._refreshTimer = null;
    this._initialTries = 0;
    this._reqCounter = 0;
    this._pendingReqs = new Map(); // id -> {resolve,reject,timeout}
  }

  getStatus(){ 
    return { type:'streamerbot', connected:this.connected, config:this.config }; 
  }

  async connect(cfg = {}){
    // Normalizar config (permitir solo puerto, host o url parcial)
    if(typeof cfg === 'string') cfg = { url: cfg };
    if(cfg.port && !cfg.url){ cfg.url = `ws://127.0.0.1:${cfg.port}`; }
    this.config = { ...this.config, ...cfg };
    if(this.connected) await this.disconnect();
    return new Promise(resolve => {
      let connectionTimeout;
      let validationTimeout;
      let resolved = false;
      
      const cleanupAndResolve = (success) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(connectionTimeout);
        clearTimeout(validationTimeout);
        resolve(success);
      };
      
      // Timeout de conexión (5 segundos)
      connectionTimeout = setTimeout(() => {
        this.emit('debug', { phase: 'error', error: 'Timeout de conexión a Streamer.bot' });
        this._onSocketClose();
        cleanupAndResolve(false);
      }, 5000);
      
      try {
        this.ws = new WebSocket(this.config.url);
        
        this.ws.on('open', () => {
          // [log cleaned]
          this.connected = true;
          this.emit('status', this.getStatus());
          
          // Intentar validar que es realmente Streamer.bot enviando GetActions
          // [log cleaned]
          this._send({ request: 'GetActions', id: 'tikcontrol-validation' });
          
          // Timeout de validación más largo (5 segundos para recibir respuesta de GetActions)
          validationTimeout = setTimeout(() => {
            // [log cleaned]
            // En lugar de fallar, asumir que es válido y continuar
            this._afterOpen();
            cleanupAndResolve(true);
          }, 5000);
          
          // Temporary message handler for validation
          const originalHandler = this._handleMessage.bind(this);
          this._handleMessage = (data) => {
            try {
              const msg = JSON.parse(data.toString());
              // [log cleaned]
              // Cualquier respuesta JSON válida indica que es un servidor WebSocket funcional
              if (msg.id === 'tikcontrol-validation' || msg.request || msg.actions !== undefined) {
                // [log cleaned]
                clearTimeout(validationTimeout);
                this._afterOpen();
                cleanupAndResolve(true);
                // Restore original handler
                this._handleMessage = originalHandler;
                return;
              }
            } catch(e) {
              // [log cleaned]
            }
            // Process with original handler
            originalHandler(data);
          };
        });
        
        this.ws.on('close', () => { 
          this._onSocketClose(); 
          if (!resolved) cleanupAndResolve(false);
        });
        
        this.ws.on('error', (err) => { 
          this.emit('debug', { phase: 'error', error: String(err) }); 
          this._onSocketClose(); 
          if (!resolved) cleanupAndResolve(false);
        });
        
        this.ws.on('message', data => this._handleMessage(data));
      } catch (e) { 
        this.emit('debug', { phase: 'error', error: String(e) }); 
        cleanupAndResolve(false);
      }
    });
  }

  async disconnect(){ 
    try { this.ws?.close(); } catch{} 
    this.connected = false; 
    this._stopAutoRefresh(); 
    this.emit('status', this.getStatus()); 
  }

  refreshResources(){ 
    if(!this.connected) return this.resources; 
    this._enumerateActions(true); 
    return this.resources; 
  }
  
  getResources(){ 
    this._mergeManual(); 
    return this.resources; 
  }

  runAction(idOrName, args = {}){
    if(!idOrName || !this.connected) return false;
    const byId = this.resources.actions.find(a=>a.id === idOrName);
    const byName = byId ? null : this.resources.actions.find(a=>a.name === idOrName);
    const action = byId ? { id: byId.id } : (byName ? { id: byName.id } : (this._isGuid(idOrName) ? { id: idOrName } : { name: idOrName }));
    const id = this._nextId();
    this._send({ request:'DoAction', id, action, ...(args && Object.keys(args).length? { args } : {}) });
    return true;
  }

  rememberAction(_name){ return false; } // manual disabled

  // --- Internal helpers ---
  _send(obj, { track=false, timeoutMs=5000 } = {}){
    if(!this.connected || !this.ws) return false;
    try {
      const txt = JSON.stringify(obj);
      this.emit('debug',{ phase:'sent', payload: txt });
      this.ws.send(txt);
      if(track && obj.id){
        const to = setTimeout(()=>{
          const pending = this._pendingReqs.get(obj.id);
          if(pending){ pending.reject(new Error('timeout')); this._pendingReqs.delete(obj.id); }
        }, timeoutMs);
        this._pendingReqs.set(obj.id, { resolve:()=>{}, reject:()=>{}, timeout: to });
      }
      return true;
    } catch(e){ this.emit('debug',{ phase:'error', error:String(e) }); return false; }
  }

  _enumerateActions(force = false){
    if(!this.connected) return;
    if(force) this._initialTries = Math.min(this._initialTries, 2);
    
    // [log cleaned]
    this._send({ request:'GetActions', id: 'tikcontrol-actions' });
  }

  _afterOpen(){
    this._initialTries = 0;
    this.authenticated = false;
    // Authenticate if password
    if(this.config.password){
      this._send({ request:'Authenticate', id: 'tikcontrol-auth', password: this.config.password });
    } else {
      this.authenticated = true; // no auth required
      this._postAuthInit();
    }
  }

  _postAuthInit(){
    if(this.config.autoSubscribe){
      this._send({ request:'Subscribe', id: 'tikcontrol-subscribe', events: { General: ['ActionExecuted'] } });
    }
    this._enumerateActions(true);
    this._startAutoRefresh();
  }

  _onSocketClose(){
    this.connected = false;
    this._stopAutoRefresh();
  }

  _handleMessage(data){
    try {
      const msg = JSON.parse(data.toString());
      // [log cleaned]
      this.emit('debug',{ phase:'received', payload: msg });
      
      if(msg.id === 'tikcontrol-auth'){
        if(msg.status === 'Ok'){ 
          // [log cleaned]
          this.authenticated = true; 
          this._postAuthInit(); 
        } else { 
          // [log cleaned]
          this.emit('debug',{ phase:'error', error:'Auth failed: '+String(msg.error||'unknown') }); 
        }
      } else if(msg.id === 'tikcontrol-actions' || msg.request === 'GetActions'){
        if(msg.actions && Array.isArray(msg.actions)){
          // [log cleaned]
          const newActions = msg.actions.map(a=>({ id: a.id||a.name, name: a.name||a.id }));
          
          // Solo actualizar si realmente hay acciones o si es la primera vez
          if(newActions.length > 0 || this.resources.actions.length === 0){
            this.resources.actions = newActions;
            // [log cleaned]
            this.emit('resources', this.resources);
          } else {
            // [log cleaned]
          }
        } else {
          // [log cleaned]
        }
      } else if(msg.id?.startsWith?.('tikcontrol-')){
        const pending = this._pendingReqs.get(msg.id); 
        if(pending){ 
          pending.resolve(msg); 
          this._pendingReqs.delete(msg.id); 
          clearTimeout(pending.timeout); 
        }
      }
      
      // Reducir la frecuencia de reintentos para evitar spam
      if(this.resources.actions.length === 0 && this._initialTries < 3){
        this._initialTries++;
        // [log cleaned]
        setTimeout(()=>{ 
          if(this.connected && this.resources.actions.length === 0) {
            // [log cleaned]
            this._enumerateActions(); 
          }
        }, 2000 + this._initialTries * 1000); // Aumentar el delay
        
        if(this._initialTries === 3){ 
          // [log cleaned]
          this.emit('debug',{ phase:'hint', info:'Sin acciones aún. Verifica puerto (8080) y que haya acciones definidas.' }); 
        }
      }
    } catch(e){ 
      // [log cleaned]
      this.emit('debug',{ phase:'error', error:'JSON parse: '+String(e) }); 
    }
  }

  _mergeManual(){
    // placeholder for manual actions if needed
  }

  _isGuid(str){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str); }
  _nextId(){ return 'tc'+(++this._reqCounter); }
  _startAutoRefresh(){ 
    this._stopAutoRefresh(); 
    // Refresh bajo demanda en lugar de interval fijo
    this._refreshTimer = null; // Remover auto-refresh constante
    // Solo refresh cuando se detecte desconexión o cambios
    // [log cleaned]
  }
  _stopAutoRefresh(){ if(this._refreshTimer){ clearInterval(this._refreshTimer); this._refreshTimer=null; } }
  
  // Execute action function
  async executeAction(actionId) {
    // [log cleaned]
    if (!this.connected || !this.ws) {
      // [log cleaned]
      throw new Error('Streamer.bot no conectado');
    }
    try {
      const id = this._nextId();
      const command = {
        id,
        request: 'DoAction',
        action: {
          id: actionId
        }
      };
      
      // console.log('[Streamer.bot Service] 🤖 Enviando comando:', JSON.stringify(command));
      this.ws.send(JSON.stringify(command));
      // [log cleaned]
      // Simple promise that resolves immediately since Streamer.bot doesn't always send responses
      return Promise.resolve();
    } catch(e) {
      console.warn('[Streamer.bot Service] ❌ Error ejecutando acción:', e);
      throw e;
    }
  }
}

const streamerbotService = new StreamerbotService();
module.exports = { streamerbotService };