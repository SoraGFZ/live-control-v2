
      
      // Filter event listeners
      $('#tts-filter-language').addEventListener('change', (e) => {
        currentLanguageFilter = e.target.value;
        // Reset country filter when language changes
        currentCountryFilter = '';
        
        // Update country filter options based on selected language
        updateCountryFilter();
        renderVoices();
      });
      
      $('#tts-filter-country').addEventListener('change', (e) => {
        currentCountryFilter = e.target.value;
        renderVoices();
      });
      
      $('#tts-clear-filters').addEventListener('click', () => {
        currentLanguageFilter = '';
        currentCountryFilter = '';
        $('#tts-filter-language').value = '';
        $('#tts-filter-country').value = '';
        renderVoices();
      });
  
      // Auto-save on change (debounced)
      function debounce(fn, ms){ let t=null; return function(){ const args=arguments; clearTimeout(t); t=setTimeout(()=> fn.apply(null,args), ms); }; }
      const autoSave = debounce(saveConfig, 400);
      const bindAuto = (sel, ev='change')=>{ const e=$(sel); if(e) e.addEventListener(ev, autoSave); };
      bindAuto('#tts-enabled');
      bindAuto('#tts-audience');
      bindAuto('#tts-member-min');
      bindAuto('#tts-prefix-only');
      bindAuto('#tts-prefix','input');
      bindAuto('#tts-filter-mode');
      bindAuto('#tts-skip-mentions');
      bindAuto('#tts-skip-emojis');
      bindAuto('#tts-speed','input');
      bindAuto('#tts-pitch','input');
      bindAuto('#tts-volume','input');
      // When chips change, call auto-save
      function addItemAndSave($input, arr, $box, isUser){ addItem($input, arr, $box, isUser); autoSave(); }
      $('#tts-whitelist-add').removeEventListener?.('click', ()=>{});
      $('#tts-banned-add').removeEventListener?.('click', ()=>{});
      $('#tts-whitelist-add').addEventListener('click', ()=> addItemAndSave($('#tts-whitelist-input'), whitelistArr, $('#tts-whitelist-chips'), true));
      $('#tts-whitelist-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); addItemAndSave($('#tts-whitelist-input'), whitelistArr, $('#tts-whitelist-chips'), true); } });
      $('#tts-banned-add').addEventListener('click', ()=> addItemAndSave($('#tts-banned-input'), bannedArr, $('#tts-banned-chips'), false));
      $('#tts-banned-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); addItemAndSave($('#tts-banned-input'), bannedArr, $('#tts-banned-chips'), false); } });
      // Re-render chip remove to autosave as well
      const _renderChipsOrig = renderChips;
      renderChips = function($box, arr, isUser){
        _renderChipsOrig($box, arr, isUser);
        // rebind remove buttons to autosave
        Array.from($box.querySelectorAll('.chip .chip-x')).forEach(btn=>{
          btn.addEventListener('click', ()=> setTimeout(autoSave, 0));
        });
      };
  
      (async ()=>{
        // Obtener perfil activo y notificar al backend
        try {
          const activeProfile = localStorage.getItem('active_profile');
          if (activeProfile) {
            console.log(`🗣️ [TTS Tab] Perfil activo detectado: "${activeProfile}"`);
            await fetch(base + '/api/tts/profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profileId: activeProfile })
            });
          }
        } catch(e) {
          console.warn('🗣️ [TTS Tab] No se pudo cargar perfil inicial:', e.message);
        }
        
        await loadVoices();
        await loadConfig();
      })();
      
      // ✅ v1.10.406: Listener de cambio de perfil ahora manejado centralmente en widgets/index.js
      // Escuchar cambios de perfil para recargar config en el UI
      window.addEventListener('profile:changed', async (e) => {
        try {
          const profileId = e.detail?.id || null;
          console.log(`🗣️ [TTS Tab] 🔄 Cambio de perfil detectado: "${profileId || 'default'}"`);
          
          // La notificación al backend ya se hace en widgets/index.js
          // Solo recargar la configuración en el UI
          await loadConfig();
        } catch(e) {
          console.error('🗣️ [TTS Tab] ❌ Error en profile:changed:', e);
        }
      });
    })();
  }


