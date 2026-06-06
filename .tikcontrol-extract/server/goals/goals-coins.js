// --- CLOUD MODE ADAPTER ------------------------------------------
// Cuando el widget se carga desde tikcontrol.live con ?uid=... habla
// directamente con el Worker (WSS) � no requiere acceso al localhost,
// no hay 403 ni mixed-content.
const __TC_GOALS_WIDGET = 'goals-coins';
const __tcUrlParams = new URLSearchParams(window.location.search);
const __tcUid = __tcUrlParams.get('uid') || '';
const __TC_IS_CLOUD = !!__tcUid && (
    window.location.hostname.includes('tikcontrol.live') ||
    window.location.protocol === 'https:'
);
// Check independiente de uid: si la p�gina corre en HTTPS (no localhost),
// NUNCA tocar 127.0.0.1 (Mixed Content).
const __TC_IS_HTTPS_PAGE = window.location.protocol === 'https:'
    && window.location.hostname !== 'localhost'
    && window.location.hostname !== '127.0.0.1';
const __TC_LOCAL_BASE = __TC_IS_HTTPS_PAGE ? window.location.origin : 'http://127.0.0.1:43123';
const __TC_WS_URL = 'wss://ws.tikcontrol.live';
const GOAL_FRAME_PACK_LAYOUTS = {
  'caos-dimensional': {
    aspect: '1481 / 93',
    top: '22.58%',
    left: '7.43%',
    right: '6.41%',
    bottom: '22.58%',
    textTop: '49.46%'
  },
  'corazon-de-dragon': {
    aspect: '1450 / 95',
    top: '32.63%',
    left: '4.55%',
    right: '5.03%',
    bottom: '18.95%',
    textTop: '56.32%'
  },
  'cristales-arcanos': {
    aspect: '1469 / 87',
    top: '22.99%',
    left: '5.85%',
    right: '6.33%',
    bottom: '16.09%',
    textTop: '52.87%'
  },
  'cristales-arcanos-2': {
    aspect: '1477 / 86',
    top: '23.26%',
    left: '5.55%',
    right: '5.55%',
    bottom: '20.93%',
    textTop: '50.58%'
  },
  'fenix-inmortal': {
    aspect: '1465 / 85',
    top: '30.59%',
    left: '6.62%',
    right: '6.35%',
    bottom: '15.29%',
    textTop: '57.06%'
  },
  'galaxia-infinita': {
    aspect: '1443 / 92',
    top: '29.35%',
    left: '4.37%',
    right: '4.57%',
    bottom: '19.57%',
    textTop: '54.35%'
  },
  'jardin-encantado': {
    aspect: '1488 / 86',
    top: '30.23%',
    left: '5.71%',
    right: '5.85%',
    bottom: '13.95%',
    textTop: '57.56%'
  },
  'jardin-encantado-2': {
    aspect: '1479 / 86',
    top: '27.91%',
    left: '5.41%',
    right: '5.21%',
    bottom: '23.26%',
    textTop: '51.74%'
  },
  'oceano-profundo': {
    aspect: '1437 / 92',
    top: '31.52%',
    left: '4.11%',
    right: '4.31%',
    bottom: '21.74%',
    textTop: '54.35%'
  },
  'rayos-celestiales': {
    aspect: '1474 / 84',
    top: '25.00%',
    left: '7.39%',
    right: '6.85%',
    bottom: '17.86%',
    textTop: '52.98%'
  },
  'viento-libre': {
    aspect: '1467 / 87',
    top: '27.59%',
    left: '5.59%',
    right: '5.93%',
    bottom: '20.69%',
    textTop: '52.87%'
  }
};

function getGoalFramePackLayout(styleImage) {
    const match = String(styleImage || '').match(/([^\/\?#]+)\.png(?:\?|$)/i);
    return match ? GOAL_FRAME_PACK_LAYOUTS[match[1]] || null : null;
}

function applyGoalFramePackLayout(element, layout) {
    const props = ['--goal-frame-aspect', '--goal-frame-bar-top', '--goal-frame-bar-left', '--goal-frame-bar-right', '--goal-frame-bar-bottom', '--goal-frame-text-top'];
    if (!element) return;
    if (!layout) {
        props.forEach((prop) => element.style.removeProperty(prop));
        return;
    }
    element.style.setProperty('--goal-frame-aspect', layout.aspect);
    element.style.setProperty('--goal-frame-bar-top', layout.top);
    element.style.setProperty('--goal-frame-bar-left', layout.left);
    element.style.setProperty('--goal-frame-bar-right', layout.right);
    element.style.setProperty('--goal-frame-bar-bottom', layout.bottom);
    element.style.setProperty('--goal-frame-text-top', layout.textTop);
}

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
            title: 'coins',
            target: 500,
            originalTarget: 500,
            current: 0,
            progress1Color: '#ffd700',
            progress2Color: '#2cb2d4',
            styleImage: '',
            whenReached: 'keep',
            fontFamily: 'System Default',
            fontUrl: ''
        };

        let currentProgress = 0;
        let progressInterval = null;
        let updateThrottle = null;

        // Cargar configuraci�n desde el servidor
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
                    
                    // Verificar que tiene datos de Coins
                    const hasConfig = parsed.goalcoins_title !== undefined || parsed.goalcoins_value !== undefined;
                    if(!hasConfig && isInitialLoad) {
                        // [log cleaned]
                        return false;
                    }
                    
                    settings.title = parsed.goalcoins_title || 'coins';
                    settings.target = parsed.goalcoins_value || 500;
                    settings.originalTarget = parsed.goalcoins_originalValue || parsed.goalcoins_value || 500;
                    settings.progress1Color = parsed.goalcoins_progress1Color || '#ffd700';
                    settings.progress2Color = parsed.goalcoins_progress2Color || '#2cb2d4';
                    settings.styleImage = parsed.goalcoins_styleImage || '';
                    settings.whenReached = parsed.goalcoins_whenReached || 'keep';
                    settings.textColor = parsed.goalcoins_textColor || '#ffffff';
                    settings.textSize = parsed.goalcoins_textSize || 20;
                    settings.textBorderColor = parsed.goalcoins_textBorderColor || '#000000';
                    settings.textBorderWidth = parsed.goalcoins_textBorderWidth || 0;
                    settings.rainbowEnabled = parsed.goalcoins_rainbowEnabled || false;
                    settings.patternEnabled = parsed.goalcoins_patternEnabled || false;
                    settings.patternUrl = parsed.goalcoins_patternUrl || '';
                    settings.patternOpacity = parsed.goalcoins_patternOpacity !== undefined ? parsed.goalcoins_patternOpacity : 0.5;
                    settings.fontFamily = parsed.goalcoins_fontFamily || 'System Default';
                    settings.fontUrl = parsed.goalcoins_fontUrl || '';
                    settings.reachAnimation = parsed.goalcoins_reachAnimation || 'shake';
                    settings.widgetType = parsed.goalcoins_widgetType || 'bar';
                    settings.compactTransparentBg = !!parsed.goalcoins_compactTransparentBg; // 'bar' | 'compact'
                    settings.changeAnimation = parsed.goalcoins_changeAnimation || 'flip';
                    // Modo radial: avatar flip
                    settings.avatarFlipEnabled = parsed.goalcoins_avatarFlipEnabled !== false; // default ON
                    settings.avatarFlipEvery = parseInt(parsed.goalcoins_avatarFlipEvery, 10) || 1;
                    settings.compactLabelColor = parsed.goalcoins_compactLabelColor || '';
                    settings.compactTargetColor = parsed.goalcoins_compactTargetColor || '';
                    settings.disableAbbreviation = !!parsed.goalcoins_disableAbbreviation;
                    settings._timestamp = parsed._timestamp || 0;
                    
                    // ? CARGAR DESDE EL ACUMULADOR TEMPORAL (persiste entre recargas de la URL)
                    // ? PRIORIDAD 1: Si hay datos en el acumulador (incluso si est� inactivo), usarlos
                    if(data.accumulator && (data.accumulator.coins > 0 || data.accumulator.isActive)) {
                        settings.current = data.accumulator.coins || 0;
                        // console.log('[Goals Widget - Coins] ? Cargado desde acumulador temporal:', settings.current, '(isActive:', data.accumulator.isActive, ')');
                    } else if(isInitialLoad) {
                        settings.current = 0;
                        // console.log('[Goals Widget - Coins] ?? Iniciando con current=0 (acumulador vac�o)');
                    }
                    
                    applySettings();
                    return true;
                }
                
                return false;
            } catch(e) {
                console.error('[Goals Widget - Coins] ? Error cargando config:', e);
                return false;
            }
        }

        // Aplicar configuraci�n
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
                console.error('[Goals Widget - Coins] ? No se encontraron elementos del DOM');
                return;
            }

            // Cargar y aplicar fuente personalizada
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
                        // [log cleaned]
                    }
                }
                
                const fontValue = settings.fontFamily + ', Arial, sans-serif';
                document.body.style.setProperty('font-family', fontValue, 'important');
                textEl.style.setProperty('font-family', fontValue, 'important');
                // [log cleaned]
            } else {
                document.body.style.fontFamily = 'Arial, sans-serif';
                textEl.style.fontFamily = 'Arial, sans-serif';
            }

            // Limpiar estilos previos
            barFill.style.background = '';
            barFill.style.backgroundColor = '';
            barFill.style.backgroundImage = '';
            barFill.classList.remove('rainbow');

            // Aplicar patr�n de imagen/GIF (prioridad alta)
            if(settings.patternEnabled && settings.patternUrl) {
                barFill.style.backgroundImage = `url("${settings.patternUrl}")`;
                barFill.style.backgroundSize = '50px 50px';
                barFill.style.backgroundPosition = '0 0';
                barFill.style.backgroundRepeat = 'repeat';
                barFill.style.backgroundColor = settings.progress1Color || '#ffd700';
                barFill.style.opacity = settings.patternOpacity || 1;
            } 
            // Aplicar efecto rainbow
            else if(settings.rainbowEnabled) {
                barFill.classList.add('rainbow');
            } 
            // Aplicar color s�lido
            else {
                barFill.style.backgroundColor = settings.progress1Color || '#ffd700';
                barFill.style.opacity = 1;
            }
            
            barBg.style.background = settings.progress2Color;

            // Aplicar color y tama�o del texto
            textEl.style.color = settings.textColor || '#ffffff';
            if(settings.textSize) {
                textEl.style.fontSize = settings.textSize + 'px';
            }
            
            // ? Aplicar borde del texto usando text-shadow (algoritmo de Top Gift - borde circular perfecto)
            const borderWidth = settings.textBorderWidth || 0;
            const borderColor = settings.textBorderColor || '#000000';
            
            if(borderWidth > 0) {
                // Contorno con -webkit-text-stroke + paint-order: stroke fill.
                // Antes us�bamos ~200 sombras puntuales (Math.hypot loop) que
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

            // Aplicar imagen de estilo PNG
            const si = settings.styleImage || '';
            const isTransparent = !si || /transparent\.png(\?|$)/i.test(si);
            const isMetasStyle = /(?:^|\/)metas\.png(?:\?|$)/i.test(si);
            const framePackLayout = getGoalFramePackLayout(si);
            const isFramePackStyle = !!framePackLayout;
            const isFramedStyle = isMetasStyle || isFramePackStyle;
            if (barContainer) {
                const progressWrapper = barContainer.querySelector('.goals-bar-progress-wrapper');
                barContainer.classList.toggle('style-metas', isMetasStyle);
                barContainer.classList.toggle('style-fantasy-frame', isFramePackStyle);
                applyGoalFramePackLayout(barContainer, framePackLayout);
                barContainer.style.width = isFramedStyle ? 'min(100%, 1040px)' : '';
                barContainer.style.height = isFramedStyle ? 'auto' : '';
                barContainer.style.margin = isFramedStyle ? '0 auto' : '';
                barContainer.style.aspectRatio = isMetasStyle ? '1472 / 150' : (framePackLayout ? framePackLayout.aspect : '');
                barContainer.style.minHeight = isFramedStyle ? '0' : '';
                barContainer.style.maxHeight = isFramedStyle ? 'none' : '';
                if (progressWrapper) {
                    progressWrapper.style.top = isMetasStyle ? '11%' : (framePackLayout ? framePackLayout.top : '');
                    progressWrapper.style.left = isMetasStyle ? '2.55%' : (framePackLayout ? framePackLayout.left : '');
                    progressWrapper.style.right = isMetasStyle ? '2.65%' : (framePackLayout ? framePackLayout.right : '');
                    progressWrapper.style.bottom = isMetasStyle ? '46%' : (framePackLayout ? framePackLayout.bottom : '');
                    progressWrapper.style.borderRadius = isFramedStyle ? '999px' : '';
                }
                overlay.style.height = isMetasStyle ? '64%' : (isFramePackStyle ? '100%' : '');
                overlay.style.zIndex = isFramedStyle ? '4' : '';
                textEl.style.top = isMetasStyle ? '31.5%' : (framePackLayout ? framePackLayout.textTop : '');
                textEl.style.zIndex = isFramedStyle ? '5' : '';
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

        // Actualizar display
        function updateDisplay() {
            if (settings.widgetType === 'compact') {
                const __pct = settings.target > 0 ? Math.min(100, (settings.current / settings.target) * 100) : 0;
                updateCompactDisplay(__pct);
                return;
            }

            const percentage = settings.target > 0 ? Math.min(100, (settings.current / settings.target) * 100) : 0;
            
            const textEl = document.getElementById('bar-text');
            if(textEl) {
                textEl.textContent = `${settings.title.toUpperCase()} - ${settings.current} / ${settings.target} COINS`;
            }

            animateProgress(percentage);
        }

        // Animar progreso
        function animateProgress(targetPercentage) {
            if(progressInterval) clearInterval(progressInterval);

            const diff = Math.abs(targetPercentage - currentProgress);
            
            // console.log('[Goals Widget - Coins] ?? animateProgress: currentProgress=' + currentProgress.toFixed(2) + '% ? target=' + targetPercentage.toFixed(2) + '% (diff=' + diff.toFixed(2) + '%)');
            
            if(diff < 2) {
                currentProgress = targetPercentage;
                document.getElementById('bar-fill').style.width = currentProgress + '%';
                // console.log('[Goals Widget - Coins] ? Actualizaci�n INSTANT�NEA a', currentProgress.toFixed(2) + '%');
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

        // Conectar a Socket.IO para actualizaciones en tiempo real
        function getGiftDiamonds(data) {
            const gift = data.gift || data.giftDetails || data.giftInfo || {};
            const value = parseInt(data._giftDiamonds, 10)
                || parseInt(data.giftDiamondValue, 10)
                || parseInt(data.giftDiamondCount, 10)
                || parseInt(data.diamondCount, 10)
                || parseInt(data.diamond_count, 10)
                || parseInt(gift.diamond_count, 10)
                || parseInt(gift.diamondCount, 10)
                || parseInt(gift.diamondValue, 10)
                || parseInt(gift.diamonds, 10)
                || parseInt(data.diamonds, 10)
                || 0;
            return value > 0 ? value : 0;
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
                    if (!evt) return;
                    if (evt.type === 'gift-solo') {
                        const data = evt.data || evt;
                        applyRealtimeIncrement(getGiftDiamonds(data), data);
                    }
                });
                return;
            }

            if (__TC_IS_HTTPS_PAGE) {
                // HTTPS sin uid: no podemos conectar a localhost (Mixed Content).
                console.warn('[Goals Widget - Coins] P�gina servida en HTTPS sin uid: no se puede conectar al servidor local.');
                return;
            }
            const baseUrl = __TC_LOCAL_BASE;

            // [log cleaned]
            const script = document.createElement('script');
            script.src = baseUrl + '/socket.io/socket.io.js';
            await new Promise((resolve) => {
                script.onload = () => {
                    // [log cleaned]
                    resolve();
                };
                script.onerror = (error) => {
                    console.error('[Goals Widget - Coins] ? Error cargando Socket.IO script:', error);
                    resolve();
                };
                document.head.appendChild(script);
            });

            if(typeof io !== 'undefined') {
                // [log cleaned]
                const socket = io(baseUrl);

                socket.on('connect', () => {
                    // [log cleaned]
                    // [log cleaned]
                });

                socket.on('disconnect', () => {
                    // [log cleaned]
                });
                
                socket.on('connect_error', (error) => {
                    console.error('[Goals Widget - Coins] ? Error de conexi�n Socket.IO:', error);
                });

                // ?? Escuchar eventos TikTok crudos SOLO para el avatar flip
                // (decorativo). El valor del goal lo sigue actualizando el
                // acumulador. Sin esto, el flip nunca disparar�a en local.
                socket.on('tiktok:event', (evt) => {
                    if (!evt) return;
                    if (evt.type === 'gift-solo') {
                        maybeFlipAvatar(evt.data || evt);
                    }
                });
                // ? NO escuchar eventos TikTok para el valor - Solo usar el acumulador
                // El acumulador (en main.js) procesa TODOS los eventos y emite goals:accumulator:update
                
                // ? Escuchar actualizaciones del acumulador en tiempo real
                socket.on('goals:accumulator:update', (data) => {
                    // [log cleaned]
                    try {
                        if(data.metric === 'coins' && data.current !== undefined) {
                            const oldCurrent = settings.current;
                            settings.current = data.current;
                            
                            // [log cleaned]
                            // Ajustar goal autom�ticamente si se super�
                            let timesReached = 0;
                            while(settings.current >= settings.target && timesReached < 1000) {
                                timesReached++;
                                handleGoalReached();
                                
                                if(settings.whenReached === 'keep' || settings.whenReached === 'hide') {
                                    break;
                                }
                            }
                            
                            updateDisplay();
                        }
                    } catch (e) {
                        console.error('[Goals Widget - Coins] ? Error procesando actualizaci�n del acumulador:', e);
                    }
                });
            } else {
                console.error('[Goals Widget - Coins] ? Socket.IO no disponible despu�s de cargar el script');
            }
        }

        // Manejar cuando se alcanza el objetivo
        function handleGoalReached() {
            const isCompact = settings.widgetType === 'compact';
            const container = isCompact
                ? document.getElementById('compact-card')
                : document.querySelector('.goals-bar-container');
            if (isCompact && container) {
                container.classList.add('reached');
                setTimeout(() => container.classList.remove('reached'), 2000);
            }
            
            // Aplicar animaci�n al alcanzar objetivo
            const reachAnimation = settings.reachAnimation || 'shake';
            if(container && reachAnimation !== 'none') {
                container.classList.add(reachAnimation);
                setTimeout(() => {
                    container.classList.remove(reachAnimation);
                }, 1500);
            }

            // Aplicar acci�n configurada con animaci�n al cambiar
            const shouldChange = settings.whenReached !== 'keep' && settings.whenReached !== 'hide';
            
            if(shouldChange) {
                const changeAnimation = settings.changeAnimation || 'flip';
                const textEl = document.getElementById('bar-text');
                
                if(textEl && changeAnimation !== 'none') {
                    textEl.classList.add(changeAnimation);
                    setTimeout(() => {
                        textEl.classList.remove(changeAnimation);
                    }, 1000);
                }
            }

            let goalChanged = false;

            switch(settings.whenReached) {
                case 'increase':
                    settings.target += settings.originalTarget;
                    goalChanged = true;
                    // [log cleaned]
                    break;
                case 'double':
                    settings.target *= 2;
                    goalChanged = true;
                    // [log cleaned]
                    break;
                case 'hide':
                    if(container) {
                        container.style.opacity = '0';
                        setTimeout(() => {
                            container.style.display = 'none';
                        }, 500);
                    }
                    break;
                case 'keep':
                default:
                    break;
            }

            if(goalChanged) {
                saveGoalToServer();
            }

            updateDisplay();
        }

        // Guardar el goal actualizado al servidor
        async function saveGoalToServer() {
            try {
                // ? ENVIAR SOLO LAS KEYS DE ESTA M�TRICA (coins), no todo el config
                const partialConfig = {
                    goalcoins_value: settings.target,
                    goalcoins_title: settings.title || 'COINS',
                    goalcoins_whenReached: settings.whenReached || 'nothing',
                    goalcoins_action: settings.action || {},
                    goalcoins_styles: settings.styles || [],
                    goalcoins_currentStyleIndex: settings.currentStyleIndex || 0,
                    _timestamp: Date.now()
                };
                
                // ?? IMPORTANTE: NO guardar el "current"
                // console.log('[Goals Widget - coins] ?? Guardando SOLO esta m�trica (coins) al servidor');
                
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
                console.error('[Goals Widget - Coins] ? Error guardando goal:', e);
            }
        }

        // Inicializar con retry
        // [log cleaned]
        let loadAttempts = 0;
        const maxAttempts = 10;
        
        async function initializeWithRetry() {
            loadAttempts++;
            const success = await loadConfig(true);
            
            if(success) {
                // [log cleaned]
                connectToServer();
            } else if(loadAttempts < maxAttempts) {
                // console.log(`[Goals Widget - Coins] ?? Reintentando carga (${loadAttempts}/${maxAttempts})...`);
                setTimeout(initializeWithRetry, 200);
            } else {
                console.warn('[Goals Widget - Coins] ?? No se pudo cargar la configuraci�n despu�s de', maxAttempts, 'intentos.');
                applySettings();
                connectToServer();
            }
        }
        
        initializeWithRetry();

        let lastConfigTimestamp = settings._timestamp || 0;

        if (__TC_IS_CLOUD) {
            // Cloud: aplicamos cualquier config recibida, incluida la primera tard�a.
            __tcOnCloudConfig(() => {
                loadConfig(false);
            });
        }

        // Recargar configuraci�n cuando detecte cambios (polling cada 2 segundos)
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
                        // console.log('[Goals Widget - Coins] ?? Config recargada por cambio en archivo (timestamp: ' + newTimestamp + ')');
                    }
                }
            } catch(e) {
                // Silenciar errores de polling
            }
        }, 2000); // ? 2 segundos es suficiente para detectar cambios sin saturar

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
            if (labelEl) labelEl.textContent = (settings.title || 'coins').toUpperCase();

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
