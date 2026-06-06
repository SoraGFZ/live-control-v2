// --- CLOUD MODE ADAPTER ------------------------------------------
// Cuando el widget se carga desde tikcontrol.live con ?uid=... habla
// directamente con el Worker (WSS) — no requiere acceso al localhost,
// no hay 403 ni mixed-content.
const __TC_GOALS_WIDGET = 'goals-gifts';
const __tcUrlParams = new URLSearchParams(window.location.search);
const __tcUid = __tcUrlParams.get('uid') || '';
const __TC_IS_CLOUD = !!__tcUid && (
    window.location.hostname.includes('tikcontrol.live') ||
    window.location.protocol === 'https:'
);
// Check independiente de uid: si la página corre en HTTPS (no localhost),
// NUNCA tocar 127.0.0.1 (Mixed Content).
const __TC_IS_HTTPS_PAGE = window.location.protocol === 'https:'
    && window.location.hostname !== 'localhost'
    && window.location.hostname !== '127.0.0.1';
const __TC_LOCAL_BASE = __TC_IS_HTTPS_PAGE ? window.location.origin : 'http://127.0.0.1:43123';
const __TC_WS_URL = 'wss://ws.tikcontrol.live';
if (!window.__tcSignedUrl) {
    window.__tcSignedUrl = function(url) {
        if (!url || typeof url !== 'string') return url;
        if (url.indexOf('storage.tikcontrol.live') === -1) return url;
        if (url.indexOf('token=') !== -1) return url;
        const tokens = window.__tcStorageTokens || {};
        let token = '';
        if (url.indexOf('/users-data/') !== -1) token = tokens.user || '';
        else if (url.indexOf('/animations/') !== -1) token = tokens.animations || '';
        else if (url.indexOf('/games/') !== -1) token = tokens.games || '';
        else if (url.indexOf('/public/') !== -1) token = tokens.public || '';
        if (!token) return url;
        return url + (url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(token);
    };
}
function __tcApplyStorageTokens(tokens) {
    if (!tokens) return;
    window.__tcStorageTokens = tokens;
    window.__tcStorageToken = tokens.user || '';
    try { window.dispatchEvent(new CustomEvent('tc:storage-token-ready', { detail: tokens })); } catch (_) { }
}
let __tcCloudWs = null;
let __tcCloudConfig = null;
const __tcConfigCbs = [];
const __tcEventCbs = [];
function __tcCloudConnect() {
    if (!__TC_IS_CLOUD) return;
    try {
        const url = `${__TC_WS_URL}?role=widget&secure=1&uid=${encodeURIComponent(__tcUid)}&widget=${encodeURIComponent(__TC_GOALS_WIDGET)}`;
        __tcCloudWs = new WebSocket(url);
        __tcCloudWs.onopen = () => {
            try {
                __tcCloudWs.send(JSON.stringify({ type: 'storage:getTokens', uid: __tcUid }));
            } catch (_) { }
            try {
                __tcCloudWs.send(JSON.stringify({
                    type: 'getWidgetConfig',
                    data: { widget: __TC_GOALS_WIDGET },
                    uid: __tcUid
                }));
            } catch (_) { }
        };
        __tcCloudWs.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (!msg || typeof msg !== 'object') return;
                if (msg.type === 'storage:sessionToken' && msg.tokens) {
                    __tcApplyStorageTokens(msg.tokens);
                    return;
                }
                if ((msg.type === 'widgetConfig' || msg.type === 'widget:configUpdated') &&
                    msg.widget === __TC_GOALS_WIDGET && msg.config) {
                    __tcCloudConfig = msg.type === 'widgetConfig'
                        ? msg.config
                        : { ...(__tcCloudConfig || {}), ...msg.config };
                    __tcConfigCbs.forEach(cb => { try { cb(__tcCloudConfig); } catch (_) { } });
                    return;
                }
                if (msg.type === 'eventBatch' && Array.isArray(msg.events)) {
                    msg.events.forEach(evt => {
                        if (evt && evt.type) {
                            __tcEventCbs.forEach(cb => { try { cb(evt); } catch (_) { } });
                        }
                    });
                    return;
                }
                if (msg.type && msg.type !== 'storage:sessionToken' && msg.type !== 'live:start') {
                    __tcEventCbs.forEach(cb => { try { cb(msg); } catch (_) { } });
                }
            } catch (_) { }
        };
        __tcCloudWs.onclose = () => { setTimeout(__tcCloudConnect, 3000); };
        __tcCloudWs.onerror = () => { };
    } catch (e) {
        console.error('[Goals Widget] Cloud WS error:', e);
    }
}
function __tcOnCloudConfig(cb) {
    __tcConfigCbs.push(cb);
    if (__tcCloudConfig) cb(__tcCloudConfig);
}
function __tcOnCloudEvent(cb) { __tcEventCbs.push(cb); }
function __tcWaitCloudConfig(timeoutMs) {
    return new Promise(resolve => {
        if (__tcCloudConfig) return resolve(__tcCloudConfig);
        let done = false;
        const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs || 8000);
        __tcOnCloudConfig(cfg => {
            if (!done) { done = true; clearTimeout(t); resolve(cfg); }
        });
    });
}
if (__TC_IS_CLOUD) __tcCloudConnect();
// --- END CLOUD MODE ADAPTER --------------------------------------

let settings = {
            title: 'REGALOS',
            target: 50,
            originalTarget: 50,
            current: 0,
            progress1Color: '#ff6b35',
            progress2Color: '#2cb2d4',
            styleImage: '',
            whenReached: 'keep',
            fontFamily: 'System Default',
            fontUrl: ''
        };

        let currentProgress = 0;
        let progressInterval = null;
        let updateThrottle = null;

        async function loadConfig(isInitialLoad = false) {
            try {
                let data;
                if (__TC_IS_CLOUD) {
                    const cfg = await __tcWaitCloudConfig(8000);
                    if (!cfg) { return false; }
                    data = { ok: true, config: cfg };
                } else {
                    if (__TC_IS_HTTPS_PAGE) {
                        // HTTPS sin uid: no podemos tocar 127.0.0.1 (Mixed Content).
                        return false;
                    }
                    const response = await fetch(__TC_LOCAL_BASE + '/api/goals/config');
                    data = await response.json();
                }
                
                if(data.ok && data.config) {
                    const parsed = data.config;
                    
                    const hasConfig = parsed.goalgifts_title !== undefined || parsed.goalgifts_value !== undefined;
                    if(!hasConfig && isInitialLoad) {
                        return false;
                    }
                    
                    settings.title = parsed.goalgifts_title || 'REGALOS';
                    settings.target = parsed.goalgifts_value || 50;
                    settings.originalTarget = parsed.goalgifts_originalValue || parsed.goalgifts_value || 50;
                    settings.progress1Color = parsed.goalgifts_progress1Color || '#ff6b35';
                    settings.progress2Color = parsed.goalgifts_progress2Color || '#2cb2d4';
                    settings.styleImage = parsed.goalgifts_styleImage || '';
                    settings.whenReached = parsed.goalgifts_whenReached || 'keep';
                    settings.textColor = parsed.goalgifts_textColor || '#ffffff';
                    settings.textSize = parsed.goalgifts_textSize || 20;
                    settings.textBorderColor = parsed.goalgifts_textBorderColor || '#000000';
                    settings.textBorderWidth = parsed.goalgifts_textBorderWidth || 0;
                    settings.rainbowEnabled = parsed.goalgifts_rainbowEnabled || false;
                    settings.patternEnabled = parsed.goalgifts_patternEnabled || false;
                    settings.patternUrl = parsed.goalgifts_patternUrl || '';
                    settings.patternOpacity = parsed.goalgifts_patternOpacity !== undefined ? parsed.goalgifts_patternOpacity : 0.5;
                    settings.fontFamily = parsed.goalgifts_fontFamily || 'System Default';
                    settings.fontUrl = parsed.goalgifts_fontUrl || '';
                    settings.reachAnimation = parsed.goalgifts_reachAnimation || 'shake';
                    settings.widgetType = parsed.goalgifts_widgetType || 'bar';
                    settings.compactTransparentBg = !!parsed.goalgifts_compactTransparentBg; // 'bar' | 'compact'
                    settings.changeAnimation = parsed.goalgifts_changeAnimation || 'flip';
                    // Modo radial: avatar flip
                    settings.avatarFlipEnabled = parsed.goalgifts_avatarFlipEnabled !== false;
                    settings.avatarFlipEvery = parseInt(parsed.goalgifts_avatarFlipEvery, 10) || 1;
                    settings.compactLabelColor = parsed.goalgifts_compactLabelColor || '';
                    settings.compactTargetColor = parsed.goalgifts_compactTargetColor || '';
                    settings.disableAbbreviation = !!parsed.goalgifts_disableAbbreviation;
                    settings._timestamp = parsed._timestamp || 0;
                    
                    if(data.accumulator && (data.accumulator.gifts > 0 || data.accumulator.isActive)) {
                        settings.current = data.accumulator.gifts || 0;
                    } else if(isInitialLoad) {
                        settings.current = 0;
                    }
                    
                    applySettings();
                    return true;
                }
                
                return false;
            } catch(e) {
                console.error('[Goals Widget - gifts] Error cargando config:', e);
                return false;
            }
        }

        function applySettings() {
            document.body.dataset.mode = settings.widgetType === 'compact' ? 'compact' : 'bar';
            if (settings.widgetType === 'compact') {
                applyCompactSettings();
                return;
            }

            const barFill = document.getElementById('bar-fill');
            const barBg = document.getElementById('bar-background');
            const textEl = document.getElementById('bar-text');
            const overlay = document.getElementById('style-overlay');
            const pattern = document.getElementById('bar-pattern');
            const barContainer = document.querySelector('.goals-bar-container');

            if(!barFill || !barBg || !textEl || !overlay || !pattern) {
                console.error('[Goals Widget - gifts] No se encontraron elementos del DOM');
                return;
            }

            if(settings.fontFamily && settings.fontFamily !== 'System Default') {
                if(settings.fontUrl) {
                    const fontId = 'goals-font-' + encodeURIComponent(settings.fontFamily);
                    if(!document.getElementById(fontId)) {
                        const style = document.createElement('style');
                        style.id = fontId;
                        if (typeof window.__tcLoadFont === 'function') {
                            window.__tcLoadFont(settings.fontFamily, settings.fontUrl);
                        } else {
                            const signedUrl = (typeof window.__tcSignedUrl === 'function') ? window.__tcSignedUrl(settings.fontUrl) : settings.fontUrl;
                            style.textContent = `@font-face{font-family:'${settings.fontFamily.replace(/'/g, "\\'")}';src:url('${signedUrl}');font-display:swap;}`;
                            document.head.appendChild(style);
                        }
                    }
                }
                
                const fontValue = settings.fontFamily + ', Arial, sans-serif';
                document.body.style.setProperty('font-family', fontValue, 'important');
                textEl.style.setProperty('font-family', fontValue, 'important');
            } else {
                document.body.style.fontFamily = 'Arial, sans-serif';
                textEl.style.fontFamily = 'Arial, sans-serif';
            }

            barFill.style.background = '';
            barFill.style.backgroundColor = '';
            barFill.style.backgroundImage = '';
            barFill.classList.remove('rainbow');

            if(settings.patternEnabled && settings.patternUrl) {
                barFill.style.backgroundImage = `url("${settings.patternUrl}")`;
                barFill.style.backgroundSize = '50px 50px';
                barFill.style.backgroundPosition = '0 0';
                barFill.style.backgroundRepeat = 'repeat';
                barFill.style.backgroundColor = settings.progress1Color || '#ff6b35';
                barFill.style.opacity = settings.patternOpacity || 1;
            } 
            else if(settings.rainbowEnabled) {
                barFill.classList.add('rainbow');
            } 
            else {
                barFill.style.backgroundColor = settings.progress1Color || '#ff6b35';
                barFill.style.opacity = 1;
            }
            
            barBg.style.background = settings.progress2Color;

            textEl.style.color = settings.textColor || '#ffffff';
            if(settings.textSize) {
                textEl.style.fontSize = settings.textSize + 'px';
            }
            
            const borderWidth = settings.textBorderWidth || 0;
            const borderColor = settings.textBorderColor || '#000000';
            
            if(borderWidth > 0) {
                // Contorno con -webkit-text-stroke + paint-order: stroke fill.
                // Antes usábamos ~200 sombras puntuales (Math.hypot loop) que
                // creaban aliasing y artefactos visuales. El stroke nativo
                // es uniforme en todas direcciones.
                const w = Math.max(0, Math.min(8, Math.floor(borderWidth)));
                textEl.style.webkitTextStroke = w + "px " + borderColor;
                textEl.style.paintOrder = "stroke fill";
                textEl.style.textShadow = "0 1px 2px rgba(0,0,0,0.5)";
            } else {
                textEl.style.webkitTextStroke = "";
                textEl.style.paintOrder = "";
                textEl.style.textShadow = "0 2px 4px rgba(0,0,0,0.5)";
            }

            const si = settings.styleImage || '';
            const isTransparent = !si || /transparent\.png(\?|$)/i.test(si);
            const isMetasStyle = /(?:^|\/)metas\.png(?:\?|$)/i.test(si);
            if (barContainer) {
                const progressWrapper = barContainer.querySelector('.goals-bar-progress-wrapper');
                barContainer.classList.toggle('style-metas', isMetasStyle);
                barContainer.style.width = isMetasStyle ? 'min(100%, 1040px)' : '';
                barContainer.style.height = isMetasStyle ? 'auto' : '';
                barContainer.style.margin = isMetasStyle ? '0 auto' : '';
                barContainer.style.aspectRatio = isMetasStyle ? '1472 / 150' : '';
                barContainer.style.minHeight = isMetasStyle ? '0' : '';
                barContainer.style.maxHeight = isMetasStyle ? 'none' : '';
                if (progressWrapper) {
                    progressWrapper.style.top = isMetasStyle ? '11%' : '';
                    progressWrapper.style.left = isMetasStyle ? '2.55%' : '';
                    progressWrapper.style.right = isMetasStyle ? '2.65%' : '';
                    progressWrapper.style.bottom = isMetasStyle ? '46%' : '';
                    progressWrapper.style.borderRadius = isMetasStyle ? '999px' : '';
                }
                overlay.style.height = isMetasStyle ? '64%' : '';
                overlay.style.zIndex = isMetasStyle ? '4' : '';
                textEl.style.top = isMetasStyle ? '31.5%' : '';
                textEl.style.zIndex = isMetasStyle ? '5' : '';
            }
            if (!isTransparent) {
                let imgSrc = si;
                const localImgMatch = imgSrc.match(/^https?:\/\/(?:127\.0\.0\.1|localhost|tikcontrol\.live)(?::\d+)?\/ImagenBar\/(.+)$/i);
                if (localImgMatch) {
                    imgSrc = 'https://tikcontrol.live/goals/styles/' + localImgMatch[1];
                } else {
                    const legacyMatch = imgSrc.match(/^\/ImagenBar\/(.+)$/i);
                    if (legacyMatch) {
                        imgSrc = 'https://tikcontrol.live/goals/styles/' + legacyMatch[1];
                    } else if (/^\/goals\/styles\//i.test(imgSrc)) {
                        imgSrc = 'https://tikcontrol.live' + imgSrc;
                    } else if (!/^https?:\/\//i.test(imgSrc)) {
                        imgSrc = __TC_IS_HTTPS_PAGE ? imgSrc : __TC_LOCAL_BASE + imgSrc;
                    }
                }
                overlay.src = imgSrc;
                overlay.style.display = 'block';
                overlay.style.visibility = 'visible';
            } else {
                overlay.removeAttribute('src');
                overlay.style.display = 'none';
            }

            updateDisplay();
        }

        function updateDisplay() {
            if (settings.widgetType === 'compact') {
                const __pct = settings.target > 0 ? Math.min(100, (settings.current / settings.target) * 100) : 0;
                updateCompactDisplay(__pct);
                return;
            }

            const percentage = settings.target > 0 ? Math.min(100, (settings.current / settings.target) * 100) : 0;
            
            const textEl = document.getElementById('bar-text');
            if(textEl) {
                textEl.textContent = `${settings.title.toUpperCase()} - ${settings.current} / ${settings.target}`;
            }

            animateProgress(percentage);
        }

        function animateProgress(targetPercentage) {
            if(progressInterval) clearInterval(progressInterval);

            const diff = Math.abs(targetPercentage - currentProgress);
            
            if(diff < 2) {
                currentProgress = targetPercentage;
                document.getElementById('bar-fill').style.width = currentProgress + '%';
                return;
            }

            if(diff < 10) {
                const steps = 3;
                const increment = (targetPercentage - currentProgress) / steps;
                
                progressInterval = setInterval(() => {
                    currentProgress += increment;
                    if((increment > 0 && currentProgress >= targetPercentage) ||
                       (increment < 0 && currentProgress <= targetPercentage)) {
                        currentProgress = targetPercentage;
                        clearInterval(progressInterval);
                    }
                    document.getElementById('bar-fill').style.width = currentProgress + '%';
                }, 10);
                return;
            }

            const steps = Math.min(8, Math.ceil(diff / 5));
            const increment = (targetPercentage - currentProgress) / steps;
            
            progressInterval = setInterval(() => {
                currentProgress += increment;
                if((increment > 0 && currentProgress >= targetPercentage) ||
                   (increment < 0 && currentProgress <= targetPercentage)) {
                    currentProgress = targetPercentage;
                    clearInterval(progressInterval);
                }
                document.getElementById('bar-fill').style.width = currentProgress + '%';
            }, 10);
        }


        function applyRealtimeIncrement(delta, avatarData, avatarOptions) {
            const increment = parseInt(delta, 10) || 0;
            if (increment > 0) {
                settings.current = (parseInt(settings.current, 10) || 0) + increment;

                let timesReached = 0;
                while(settings.current >= settings.target && timesReached < 1000) {
                    timesReached++;
                    handleGoalReached();
                    if(settings.whenReached === 'keep' || settings.whenReached === 'hide') break;
                }

                updateDisplay();
            }

            if (avatarData) maybeFlipAvatar(avatarData, avatarOptions);
        }

        async function connectToServer() {
            if (__TC_IS_CLOUD) {
                __tcOnCloudEvent((evt) => {
                    if (evt && evt.type === 'gift-solo') {
                        applyRealtimeIncrement(1, evt.data || evt);
                    }
                });
                return;
            }
            if (__TC_IS_HTTPS_PAGE) {
                // HTTPS sin uid: no podemos conectar a localhost (Mixed Content).
                console.warn('[Goals Widget - gifts] Página servida en HTTPS sin uid: no se puede conectar al servidor local.');
                return;
            }
            const baseUrl = __TC_LOCAL_BASE;

            const script = document.createElement('script');
            script.src = baseUrl + '/socket.io/socket.io.js';
            await new Promise((resolve) => {
                script.onload = () => resolve();
                script.onerror = () => resolve();
                document.head.appendChild(script);
            });

            if(typeof io !== 'undefined') {
                const socket = io(baseUrl);

                socket.on('connect', () => {});
                socket.on('disconnect', () => {});
                socket.on('connect_error', (error) => {
                    console.error('[Goals Widget - gifts] Error de conexión Socket.IO:', error);
                });

                socket.on('tiktok:event', (evt) => {
                    if (evt && evt.type === 'gift-solo') maybeFlipAvatar(evt.data || evt);
                });

                socket.on('goals:accumulator:update', (data) => {
                    try {
                        if(data.metric === 'gifts' && data.current !== undefined) {
                            settings.current = data.current;
                            
                            let timesReached = 0;
                            while(settings.current >= settings.target && timesReached < 1000) {
                                timesReached++;
                                handleGoalReached();
                                if(settings.whenReached === 'keep' || settings.whenReached === 'hide') break;
                            }
                            
                            updateDisplay();
                        }
                    } catch(e) {
                        console.error('[Goals Widget - gifts] Error procesando actualización:', e);
                    }
                });
            }
        }

        function handleGoalReached() {
            const isCompact = settings.widgetType === 'compact';
            const container = isCompact
                ? document.getElementById('compact-card')
                : document.querySelector('.goals-bar-container');
            if (isCompact && container) {
                container.classList.add('reached');
                setTimeout(() => container.classList.remove('reached'), 2000);
            }
            
            const reachAnimation = settings.reachAnimation || 'shake';
            if(container && reachAnimation !== 'none') {
                container.classList.add(reachAnimation);
                setTimeout(() => container.classList.remove(reachAnimation), 1100);
            }

            const shouldChange = settings.whenReached !== 'keep' && settings.whenReached !== 'hide';
            
            if(shouldChange) {
                const changeAnimation = settings.changeAnimation || 'flip';
                const textEl = document.getElementById('bar-text');
                if(textEl && changeAnimation !== 'none') {
                    textEl.classList.add(changeAnimation);
                    setTimeout(() => textEl.classList.remove(changeAnimation), 1000);
                }
            }

            switch(settings.whenReached) {
                case 'increase':
                    settings.target += settings.originalTarget;
                    break;
                case 'double':
                    settings.target *= 2;
                    break;
                case 'hide':
                    if(container) {
                        container.style.opacity = '0';
                        setTimeout(() => container.style.display = 'none', 100);
                    }
                    break;
            }

            saveGoalToServer();
            updateDisplay();
        }

        async function saveGoalToServer() {
            try {
                const partialConfig = {
                    goalgifts_value: settings.target,
                    goalgifts_title: settings.title || 'REGALOS',
                    goalgifts_whenReached: settings.whenReached || 'nothing',
                    _timestamp: Date.now()
                };
                
                if (__TC_IS_CLOUD) {
                    if (__tcCloudWs && __tcCloudWs.readyState === WebSocket.OPEN) {
                        __tcCloudWs.send(JSON.stringify({
                            type: 'widget:config',
                            data: { widget: __TC_GOALS_WIDGET, config: partialConfig },
                            uid: __tcUid
                        }));
                    }
                } else if (!__TC_IS_HTTPS_PAGE) {
                    await fetch(__TC_LOCAL_BASE + '/api/goals/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(partialConfig)
                    });
                }
            } catch(e) {
                console.error('[Goals Widget - gifts] Error guardando goal:', e);
            }
        }

        let loadAttempts = 0;
        const maxAttempts = 10;
        
        async function initializeWithRetry() {
            loadAttempts++;
            const success = await loadConfig(true);
            
            if(success) {
                connectToServer();
            } else if(loadAttempts < maxAttempts) {
                setTimeout(initializeWithRetry, 200);
            } else {
                applySettings();
                connectToServer();
            }
        }
        
        initializeWithRetry();

        let lastConfigTimestamp = settings._timestamp || 0;

        if (__TC_IS_CLOUD) {
            // Cloud: aplicamos cualquier config recibida, incluida la primera tardía.
            __tcOnCloudConfig(() => {
                loadConfig(false);
            });
        }

        setInterval(async () => {
            try {
if (__TC_IS_CLOUD) return; // cloud usa push (widget:configUpdated)
                if (__TC_IS_HTTPS_PAGE) return; // HTTPS sin uid: no tocar 127.0.0.1
                const response = await fetch(__TC_LOCAL_BASE + '/api/goals/config');
                const data = await response.json();
                
                if(data.ok && data.config) {
                    const newTimestamp = data.config._timestamp || 0;
                    if(newTimestamp > lastConfigTimestamp) {
                        lastConfigTimestamp = newTimestamp;
                        loadConfig(false);
                    }
                }
            } catch(e) {}
        }, 2000);


        const COMPACT_CIRC = 263.89;
        function applyCompactSettings() {
            const card = document.getElementById('compact-card');
            const ringFill = document.getElementById('ring-fill');
            if (!card || !ringFill) return;

            card.style.setProperty('--fill-color', settings.progress1Color || '#ff0099');
            card.style.setProperty('--track-color', settings.progress2Color || 'rgba(255,255,255,0.08)');
            card.style.setProperty('--text-color', settings.textColor || '#ffffff');

            if (settings.compactTransparentBg) {
                card.style.background = 'transparent';
                card.style.boxShadow = 'none';
                card.style.border = 'none';
                card.style.backdropFilter = 'none';
                card.style.webkitBackdropFilter = 'none';
            } else {
                card.style.background = '';
                card.style.boxShadow = '';
                card.style.border = '';
                card.style.backdropFilter = '';
                card.style.webkitBackdropFilter = '';
            }

            ringFill.classList.toggle('rainbow', !!settings.rainbowEnabled);

            if (settings.fontFamily && settings.fontFamily !== 'System Default') {
                if (settings.fontUrl) {
                    const fid = 'goals-font-' + encodeURIComponent(settings.fontFamily);
                    if (!document.getElementById(fid)) {
                        const st = document.createElement('style');
                        st.id = fid;
                        if (typeof window.__tcLoadFont === 'function') {
                            window.__tcLoadFont(settings.fontFamily, settings.fontUrl);
                        } else {
                            const signedUrl = (typeof window.__tcSignedUrl === 'function') ? window.__tcSignedUrl(settings.fontUrl) : settings.fontUrl;
                            st.textContent = `@font-face{font-family:'${settings.fontFamily.replace(/'/g, "\\'")}';src:url('${signedUrl}');font-display:swap;}`;
                            document.head.appendChild(st);
                        }
                    }
                }
                document.body.style.fontFamily = settings.fontFamily + ', Arial, sans-serif';
            } else {
                document.body.style.fontFamily = '';
            }

            const txtColor = settings.textColor || '#ffffff';
            const labelColor = settings.compactLabelColor || txtColor;
            const targetColor = settings.compactTargetColor || txtColor;
            const borderColor = settings.textBorderColor || '#000000';
            const borderWidth = parseInt(settings.textBorderWidth || 0, 10);
            // Contorno con -webkit-text-stroke + paint-order: stroke fill
            // (uniforme en todas direcciones, sin artefactos visibles).
            const w = Math.max(0, Math.min(8, Math.floor(borderWidth)));
            const colorsByEl = {
                "compact-label": labelColor,
                "compact-value": txtColor,
                "compact-target": targetColor
            };
            Object.keys(colorsByEl).forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.style.color = colorsByEl[id];
                if (w > 0) {
                    el.style.webkitTextStroke = w + "px " + borderColor;
                    el.style.paintOrder = "stroke fill";
                    el.style.textShadow = "0 1px 2px rgba(0,0,0,0.5)";
                } else {
                    el.style.webkitTextStroke = "";
                    el.style.paintOrder = "";
                    el.style.textShadow = "0 2px 4px rgba(0,0,0,0.5)";
                }
            });

            const labelEl = document.getElementById('compact-label');
            if (labelEl) labelEl.textContent = (settings.title || 'gifts').toUpperCase();

            updateCompactDisplay(settings.target > 0 ? Math.min(100, (settings.current / settings.target) * 100) : 0);
        }
        function updateCompactDisplay(percentage) {
            const ringFill = document.getElementById('ring-fill');
            const valueEl = document.getElementById('compact-value');
            const targetEl = document.getElementById('compact-target');
            const pctEl = document.getElementById('compact-pct');
            if (!ringFill) return;
            ringFill.style.strokeDashoffset = String(COMPACT_CIRC - COMPACT_CIRC * percentage / 100);
            if (valueEl) valueEl.textContent = formatCompactCount(settings.current);
            if (targetEl) targetEl.textContent = formatCompactCount(settings.target);
            if (pctEl) pctEl.textContent = Math.round(percentage) + '%';
        }
        function formatCompactCount(n) {
            if (settings.disableAbbreviation) {
                try { return Number(n).toLocaleString('es-ES'); }
                catch (_) { return String(n); }
            }
            if (n < 1000) return String(n);
            if (n < 10000) return (n / 1000).toFixed(1) + 'K';
            if (n < 1000000) return Math.floor(n / 1000) + 'K';
            return (n / 1000000).toFixed(1) + 'M';
        }

        // --- Avatar flip (compartido entre los 6 widgets goals) -------
        let __avatarFlipCount = 0;
        let __avatarFlipPerUser = {};
        let __avatarFlipTimer = null;
        let __avatarBusy = false;
        function extractAvatar(data) {
            if (!data) return '';
            const user = data.user || data;
            if (typeof user.profilePictureUrl === 'string' && user.profilePictureUrl) return user.profilePictureUrl;
            if (typeof data.profilePictureUrl === 'string' && data.profilePictureUrl) return data.profilePictureUrl;
            if (user.profilePicture && typeof user.profilePicture === 'object') {
                const pp = user.profilePicture;
                if (Array.isArray(pp.url) && pp.url.length) return pp.url[0];
                if (typeof pp.url === 'string') return pp.url;
                if (Array.isArray(pp.urls) && pp.urls.length) return pp.urls[0];
            }
            const av = user.avatarThumb || user.avatarMedium;
            if (av) {
                if (typeof av === 'string') return av;
                if (typeof av === 'object') {
                    if (Array.isArray(av.url) && av.url.length) return av.url[0];
                    if (typeof av.url === 'string') return av.url;
                    if (Array.isArray(av.urls) && av.urls.length) return av.urls[0];
                    if (Array.isArray(av.urlList) && av.urlList.length) return av.urlList[0];
                }
            }
            if (typeof user.avatarUrl === 'string' && user.avatarUrl) return user.avatarUrl;
            if (typeof data.avatar === 'string' && data.avatar) return data.avatar;
            return '';
        }
        function triggerAvatarFlip(avatarUrl) {
            if (!avatarUrl) return;
            if (settings.widgetType !== 'compact') return;
            if (settings.avatarFlipEnabled === false) return;
            const flipper = document.getElementById('ring-icon-flipper');
            const img = document.getElementById('ring-avatar');
            if (!flipper || !img) return;
            img.src = avatarUrl;
            if (__avatarBusy) {
                if (__avatarFlipTimer) clearTimeout(__avatarFlipTimer);
                __avatarFlipTimer = setTimeout(() => {
                    flipper.classList.remove('flipped');
                    __avatarBusy = false;
                }, 3500);
                return;
            }
            __avatarBusy = true;
            flipper.classList.add('flipped');
            if (__avatarFlipTimer) clearTimeout(__avatarFlipTimer);
            __avatarFlipTimer = setTimeout(() => {
                flipper.classList.remove('flipped');
                __avatarBusy = false;
            }, 3500);
        }
        function maybeFlipAvatar(data, opts) {
            try {
                if (settings.widgetType !== 'compact') return;
                if (settings.avatarFlipEnabled === false) return;
                const every = parseInt(settings.avatarFlipEvery, 10);
                if (!every || every < 1) return;
                const url = extractAvatar(data);
                if (!url) return;
                if (opts && opts.perUser) {
                    const uid = (data.user?.uniqueId) || data.uniqueId || '';
                    if (!uid) return;
                    __avatarFlipPerUser[uid] = (__avatarFlipPerUser[uid] || 0) + 1;
                    if (__avatarFlipPerUser[uid] >= every) {
                        __avatarFlipPerUser[uid] = 0;
                        triggerAvatarFlip(url);
                    }
                    return;
                }
                __avatarFlipCount += (opts && typeof opts.increment === 'number') ? opts.increment : 1;
                if (__avatarFlipCount >= every) {
                    __avatarFlipCount = 0;
                    triggerAvatarFlip(url);
                }
            } catch (_) { }
        }
