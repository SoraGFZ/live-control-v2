// Wrapper CommonJS para el servicio OBS ES6
const { EventEmitter } = require('events');

let OBSWebSocket;
try { 
  // Intenta cargar obs-websocket-js si está disponible
  OBSWebSocket = require('obs-websocket-js').default || require('obs-websocket-js');
} catch { 
  /* dependencia opcional */ 
}

class ObsService extends EventEmitter {
  constructor(){
    super();
    this.client = null; 
    this.connected = false;
    this.config = { url:'ws://127.0.0.1:4455', password:'' };
    this.resources = { scenes: [], sourcesByScene: {} };
    this._refreshing = false;
  }
  
  getStatus(){ 
    return { type:'obs', connected:this.connected, config:this.config }; 
  }
  
  async connect(cfg={}){
    this.config = { ...this.config, ...cfg };
    if(!OBSWebSocket){ 
      this.emit('error',{ integration:'obs', message:'obs-websocket-js no instalado'}); 
      return false; 
    }
    if(this.connected) await this.disconnect();
    this.client = new OBSWebSocket();
    try {
      await this.client.connect(this.config.url, this.config.password);
      this.connected = true; 
      this.emit('status', this.getStatus());
      this.client.on('SceneListChanged', ()=> { 
        this.emit('event',{integration:'obs', type:'scene_list_changed'}); 
        this.refreshResources(); 
      });
      this.refreshResources().catch(()=>{});
      return true;
    } catch(e){ 
      this.connected = false; 
      this.emit('error',{integration:'obs', message:e.message}); 
      return false; 
    }
  }
  
  async disconnect(){ 
    try { await this.client?.disconnect(); } catch{} 
    this.connected = false; 
    this.emit('status', this.getStatus()); 
  }
  
  getResources(){ 
    return this.resources; 
  }
  
  async refreshResources(){
    if(!this.connected || !this.client || this._refreshing) return this.resources;
    this._refreshing = true;
    try {
      // OBS WebSocket v5 API
      const sceneList = await this.client.call('GetSceneList');
      const scenes = (sceneList.scenes||[]).map(s=>s.sceneName);
      const sourcesByScene = {};
      for(const sceneName of scenes){
        try {
          const items = await this.client.call('GetSceneItemList', { sceneName });
          sourcesByScene[sceneName] = (items.sceneItems||[]).map(i=>i.sourceName);
        } catch { 
          sourcesByScene[sceneName] = []; 
        }
      }
      this.resources = { scenes, sourcesByScene };
      this.emit('resources', this.resources);
    } catch(e){ 
      /* ignore */ 
    } finally { 
      this._refreshing = false; 
    }
    return this.resources;
  }
  
  // Action execution functions
  async setCurrentScene(sceneName) {
    // [log cleaned]
    if (!this.connected || !this.client) {
      // [log cleaned]
      throw new Error('OBS no conectado');
    }
    try {
      // [log cleaned]
      await this.client.call('SetCurrentProgramScene', { sceneName });
      // [log cleaned]
    } catch(e) {
      console.warn('[OBS Service] ❌ Error cambiando escena:', e);
      throw e;
    }
  }
  
  async setSourceVisible(sourceName, visible = true) {
    if (!this.connected || !this.client) throw new Error('OBS no conectado');
    try {
      // Find the source in all scenes
      for (const [sceneName, sources] of Object.entries(this.resources.sourcesByScene || {})) {
        if (sources.includes(sourceName)) {
          const sceneItems = await this.client.call('GetSceneItemList', { sceneName });
          const item = sceneItems.sceneItems?.find(i => i.sourceName === sourceName);
          if (item) {
            await this.client.call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: item.sceneItemId,
              sceneItemEnabled: visible
            });
            // [log cleaned]
            return;
          }
        }
      }
      throw new Error(`Fuente "${sourceName}" no encontrada`);
    } catch(e) {
      console.warn('[OBS] Error modificando visibilidad de fuente:', e);
      throw e;
    }
  }
  
  async toggleSourceVisibility(sourceName) {
    if (!this.connected || !this.client) throw new Error('OBS no conectado');
    try {
      // Find the source and get current state
      for (const [sceneName, sources] of Object.entries(this.resources.sourcesByScene || {})) {
        if (sources.includes(sourceName)) {
          const sceneItems = await this.client.call('GetSceneItemList', { sceneName });
          const item = sceneItems.sceneItems?.find(i => i.sourceName === sourceName);
          if (item) {
            const newState = !item.sceneItemEnabled;
            await this.client.call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: item.sceneItemId,
              sceneItemEnabled: newState
            });
            // [log cleaned]
            return;
          }
        }
      }
      throw new Error(`Fuente "${sourceName}" no encontrada`);
    } catch(e) {
      console.warn('[OBS] Error alternando visibilidad de fuente:', e);
      throw e;
    }
  }
  
  async soloSource(sourceName) {
    if (!this.connected || !this.client) throw new Error('OBS no conectado');
    try {
      // Find the scene containing the source and hide all others, show this one
      for (const [sceneName, sources] of Object.entries(this.resources.sourcesByScene || {})) {
        if (sources.includes(sourceName)) {
          const sceneItems = await this.client.call('GetSceneItemList', { sceneName });
          
          // Hide all sources first
          for (const item of sceneItems.sceneItems || []) {
            await this.client.call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: item.sceneItemId,
              sceneItemEnabled: false
            });
          }
          
          // Show only the target source
          const targetItem = sceneItems.sceneItems?.find(i => i.sourceName === sourceName);
          if (targetItem) {
            await this.client.call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: targetItem.sceneItemId,
              sceneItemEnabled: true
            });
            // [log cleaned]
            return;
          }
        }
      }
      throw new Error(`Fuente "${sourceName}" no encontrada`);
    } catch(e) {
      console.warn('[OBS] Error aplicando solo a fuente:', e);
      throw e;
    }
  }
}

const obsService = new ObsService();
module.exports = { obsService };