// --- CLOUD MODE ADAPTER ------------------------------------------
// Cuando el widget se carga desde tikcontrol.live con ?uid=... habla
// directamente con el Worker (WSS) � no requiere acceso al localhost,
// no hay 403 ni mixed-content. En localhost (OBS misma m�quina) se
// mantiene el comportamiento original (Socket.IO + fetch /api/goals/config).
const __TC_GOALS_WIDGET = 'goals-likes';
const __tcUrlParams = new URLSearchParams(window.location.search);
const __tcUid = __tcUrlParams.get('uid') || '';
const __TC_IS_CLOUD = !!__tcUid && (
    window.location.hostname.includes('tikcontrol.live') ||
    window.location.protocol === 'https:'
);
// Check independiente de uid: si la p�gina corre en HTTPS (no localhost),
// NUNCA tocar 127.0.0.1 (Mixed Content). Sirve como base url default.
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
                // widgetConfig (initial) o widget:configUpdated (live)
                if ((msg.type === 'widgetConfig' || msg.type === 'widget:configUpdated') &&
                    msg.widget === __TC_GOALS_WIDGET && msg.config) {
                    __tcCloudConfig = msg.type === 'widgetConfig'
                        ? msg.config
                        : { ...(__tcCloudConfig || {}), ...msg.config };
                    __tcConfigCbs.forEach(cb => { try { cb(__tcCloudConfig); } catch (_) { } });
                    return;
                }
                // eventBatch (r�fagas)
                if (msg.type === 'eventBatch' && Array.isArray(msg.events)) {
                    msg.events.forEach(evt => {
                        if (evt && evt.type) {
                            __tcEventCbs.forEach(cb => { try { cb(evt); } catch (_) { } });
                        }
                    });
                    return;
                }
                // Eventos individuales (gift, like, ...)
                if (msg.type && msg.type !== 'storage:sessionToken' && msg.type !== 'live:start') {
                    __tcEventCbs.forEach(cb => { try { cb(msg); } catch (_) { } });
                }
            } catch (_) { }
        };
        __tcCloudWs.onclose = () => { setTimeout(__tcCloudConnect, 3000); };
        __tcCloudWs.onerror = () => { /* onclose maneja la reconexi�n */ };
    } catch (e) {
        console.error('[Goals Widget] Cloud WS error:', e);
    }
}
function __tcOnCloudConfig(cb) {
    __tcConfigCbs.push(cb);
    if (__tcCloudConfig) cb(__tcCloudConfig);
}
function __tcOnCloudEvent(cb) { __tcEventCbs.push(cb); }
if (__TC_IS_CLOUD) __tcCloudConnect();
// --- END CLOUD MODE ADAPTER --------------------------------------

let settings = {
            title: 'likes',
            target: 5000,
            originalTarget: 5000, // Guardar el goal original para "increase"
            current: 0,
            progress1Color: '#ff0099',
            progress2Color: '#2cb2d4',
            styleImage: '',
            whenReached: 'keep',
            fontFamily: 'System Default',
            fontUrl: ''
        };

        let currentProgress = 0;
        let progressInterval = null;
        let updateThrottle = null; // Para agrupar actualizaciones r�pidas

        // Helper para esperar la config del cloud (con timeout)
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

        // Cargar configuraci�n desde el servidor (cloud o localhost)
        async function loadConfig(isInitialLoad = false) {
            try {
                let data;
                if (__TC_IS_CLOUD) {
                    const cfg = await __tcWaitCloudConfig(8000);
                    if (!cfg) {
                        if (isInitialLoad) return false;
                        return false;
                    }
                    data = { ok: true, config: cfg };
                } else {
                    if (__TC_IS_HTTPS_PAGE) {
                        // Sirviendo desde HTTPS sin uid: no podemos tocar 127.0.0.1.
                        if (isInitialLoad) return false;
                        return false;
                    }
                    const response = await fetch(__TC_LOCAL_BASE + '/api/goals/config');
                    data = await response.json();
                }
                
                if(data.ok && data.config) {
                    const parsed = data.config;
                    
                    // ?? Verificar que la configuraci�n tiene datos de Likes
                    const hasLikesConfig = parsed.goallikes_title !== undefined || parsed.goallikes_value !== undefined;
                    
                    if(!hasLikesConfig && isInitialLoad) {
                        // [log cleaned]
                        return false; // Indicar que falt� la config
                    }
                    
                    settings.title = parsed.goallikes_title || 'likes';
                    // Anti-oscilaci�n: si NO es initial load, nunca bajar el
                    // target ni invertir un auto-extend. Si hay varias
                    // instancias del widget conectadas (OBS + pesta�a
                    // Widgets de la app), una puede recibir un update viejo
                    // con target menor y entrar en bucle de extensi�n.
                    // Forzar always >= local evita el ping-pong.
                    const __newTarget = parsed.goallikes_value || 5000;
                    if (isInitialLoad || __newTarget >= (settings.target || 0)) {
                        settings.target = __newTarget;
                    }
                    settings.originalTarget = parsed.goallikes_originalValue || parsed.goallikes_value || 5000; // Goal original
                    settings.progress1Color = parsed.goallikes_progress1Color || '#ff0099';
                    settings.progress2Color = parsed.goallikes_progress2Color || '#2cb2d4';
                    settings.styleImage = parsed.goallikes_styleImage || '';
                    settings.whenReached = parsed.goallikes_whenReached || 'keep';
                    settings.textColor = parsed.goallikes_textColor || '#ffffff';
                    settings.textSize = parsed.goallikes_textSize || 20;
                    settings.textBorderColor = parsed.goallikes_textBorderColor || '#000000';
                    settings.textBorderWidth = parsed.goallikes_textBorderWidth || 0;
                    settings.rainbowEnabled = parsed.goallikes_rainbowEnabled || false;
                    settings.patternEnabled = parsed.goallikes_patternEnabled || false;
                    settings.patternUrl = parsed.goallikes_patternUrl || '';
                    settings.patternOpacity = parsed.goallikes_patternOpacity !== undefined ? parsed.goallikes_patternOpacity : 0.5;
                    settings.fontFamily = parsed.goallikes_fontFamily || 'System Default';
                    settings.fontUrl = parsed.goallikes_fontUrl || '';
                    settings.reachAnimation = parsed.goallikes_reachAnimation || 'shake';
                    settings.changeAnimation = parsed.goallikes_changeAnimation || 'flip';
                    settings.widgetType = parsed.goallikes_widgetType || 'bar'; // 'bar' | 'compact'
                    settings.compactTransparentBg = !!parsed.goallikes_compactTransparentBg;
                    // Modo radial: flip a avatar
                    settings.avatarFlipEnabled = parsed.goallikes_avatarFlipEnabled !== false; // default ON
                    settings.avatarFlipEvery = parseInt(parsed.goallikes_avatarFlipEvery, 10) || 100;
                    // Colores espec�ficos del modo radial (label, value y target)
                    settings.compactLabelColor = parsed.goallikes_compactLabelColor || '';
                    settings.compactTargetColor = parsed.goallikes_compactTargetColor || '';
                    // Mostrar n�meros completos (sin K/M)
                    settings.disableAbbreviation = !!parsed.goallikes_disableAbbreviation;
                    settings._timestamp = parsed._timestamp || 0;
                    
                    // ?? CR�TICO: El widget HTML SIEMPRE empieza con current=0
                    // Solo la UI de TikControl controla el reset del current
                    // El widget acumula desde 0 con cada evento de TikTok que recibe
                    if(isInitialLoad) {
                        settings.current = 0;
                        // console.log('[Goals Widget] ?? Iniciando con current=0 (RESET)');
                    }
                    
                    applySettings();
                    return true; // Indicar que la config se carg� correctamente
                }
                
                return false; // No hay config
            } catch(e) {
                console.error('[Goals Widget] ? Error cargando config:', e);
                return false;
            }
        }

        // Aplicar configuraci�n
        function applySettings() {
            // --- Modo barra vs radial ---------------------------------
            // Marcar el body con data-mode para que el CSS muestre/oculte
            // el bloque correcto. La URL del widget NO cambia � el creador
            // pega siempre goals-likes.html y el modo se decide aqu�.
            document.body.dataset.mode = settings.widgetType === 'compact' ? 'compact' : 'bar';

            // Aplicar estilos al modo activo (cada modo tiene su DOM).
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
                console.error('[Goals Widget] ? No se encontraron elementos del DOM');
                return;
            }

            // Cargar y aplicar fuente personalizada
            if(settings.fontFamily && settings.fontFamily !== 'System Default') {
                // Cargar la fuente si tiene URL
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
                barFill.style.backgroundSize = '50px 50px'; // Tama�o fijo para repetirse
                barFill.style.backgroundPosition = '0 0';
                barFill.style.backgroundRepeat = 'repeat'; // Repetir patr�n
                barFill.style.backgroundColor = settings.progress1Color || '#ff0099'; // Color de respaldo
                barFill.style.opacity = settings.patternOpacity || 1;
            } 
            // Aplicar efecto rainbow
            else if(settings.rainbowEnabled) {
                barFill.classList.add('rainbow');
            } 
            // Aplicar color s�lido
            else {
                barFill.style.backgroundColor = settings.progress1Color || '#ff0099';
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

            // Aplicar imagen de estilo PNG.
            // - Estilo 1 (transparent.png) = sin overlay, se oculta.
            // - URLs absolutas (https://...) se usan tal cual (cloud).
            // - Rutas relativas se sirven desde el server local SOLO si el
            //   widget corre en localhost; si est� en URL p�blica (HTTPS),
            //   se remapean al CDN p�blico para evitar Mixed Content.
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

        // Actualizar display (con throttling para actualizaciones r�pidas)
        function updateDisplay() {
            const percentage = settings.target > 0 ? Math.min(100, (settings.current / settings.target) * 100) : 0;

            // Modo compact tiene su propio updater (anillo SVG).
            if (settings.widgetType === 'compact') {
                updateCompactDisplay(percentage);
                return;
            }

            const textEl = document.getElementById('bar-text');
            if(textEl) {
                textEl.textContent = `${settings.title.toUpperCase()} - ${settings.current} / ${settings.target} LIKES`;
            }

            // Actualizar inmediatamente sin throttling para m�xima velocidad
            animateProgress(percentage);
        }

        // --- Modo compact (radial) ------------------------------------
        // Aplica colores/font al card radial. Se llama desde applySettings
        // cuando widgetType==='compact'. Comparte settings con la barra.
        const COMPACT_CIRC = 263.89; // 2*PI*42

        function applyCompactSettings() {
            const card = document.getElementById('compact-card');
            const ringFill = document.getElementById('ring-fill');
            if (!card || !ringFill) return;

            card.style.setProperty('--fill-color', settings.progress1Color || '#ff0099');
            card.style.setProperty('--track-color', settings.progress2Color || 'rgba(255,255,255,0.08)');
            card.style.setProperty('--text-color', settings.textColor || '#ffffff');

            // Toggle de fondo transparente (sin card oscura). Default = card visible.
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

            // Rainbow en el anillo
            ringFill.classList.toggle('rainbow', !!settings.rainbowEnabled);

            // Fuente personalizada (mismo cargado que el modo barra)
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

            // Color de texto + contorno. Cada elemento del card puede tener
            // su propio color (compactLabelColor / textColor / compactTargetColor).
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
            // El % de la l�nea target hereda el fill-color, lo respetamos.

            // Label
            const labelEl = document.getElementById('compact-label');
            if (labelEl) labelEl.textContent = (settings.title || 'likes').toUpperCase();

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
            // Toggle "Mostrar n�meros completos" (settings.disableAbbreviation):
            // si est� activo, muestra el valor con separadores de miles (ej.
            // 2.000.000) en vez de 2.0M.
            if (settings.disableAbbreviation) {
                try { return Number(n).toLocaleString('es-ES'); }
                catch (_) { return String(n); }
            }
            if (n < 1000) return String(n);
            if (n < 10000) return (n / 1000).toFixed(1) + 'K';
            if (n < 1000000) return Math.floor(n / 1000) + 'K';
            return (n / 1000000).toFixed(1) + 'M';
        }

        // --- Avatar flip en el ring del modo radial ------------------
        // Cada N eventos (configurable) el SVG hace un flip 3D y deja ver
        // el avatar del �ltimo usuario que dispar� el evento durante 3.5s,
        // luego vuelve al SVG. Para shares cuenta por uniqueId; el resto
        // suma global. Implementaci�n compartida entre los 6 widgets goals.
        let __avatarFlipCount = 0;            // contador de eventos para el flip
        let __avatarFlipPerUser = {};         // uniqueId ? count (para shares)
        let __avatarFlipTimer = null;         // timer del retorno al SVG
        let __avatarBusy = false;             // evita spam de flips superpuestos

        function extractAvatar(data) {
            if (!data) return '';
            const user = data.user || data;
            // 1. profilePictureUrl directo
            if (typeof user.profilePictureUrl === 'string' && user.profilePictureUrl) return user.profilePictureUrl;
            if (typeof data.profilePictureUrl === 'string' && data.profilePictureUrl) return data.profilePictureUrl;
            // 2. profilePicture {url|urls}
            if (user.profilePicture && typeof user.profilePicture === 'object') {
                const pp = user.profilePicture;
                if (Array.isArray(pp.url) && pp.url.length) return pp.url[0];
                if (typeof pp.url === 'string') return pp.url;
                if (Array.isArray(pp.urls) && pp.urls.length) return pp.urls[0];
            }
            // 3. avatarThumb / avatarMedium
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

            // Si est� en mitad del flip, solo actualiza la imagen y resetea el timer
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

        // Llamar tras procesar un evento. Por defecto cuenta global; si se
        // pasa uniqueId acumula por usuario (modo shares).
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
            } catch (e) {
                // Silencioso � el flip es decorativo, no debe romper el goal
            }
        }

        // Animar progreso (ultra r�pido - actualizaci�n casi instant�nea)
        function animateProgress(targetPercentage) {
            if(progressInterval) clearInterval(progressInterval);

            // Calcular diferencia
            const diff = Math.abs(targetPercentage - currentProgress);
            
            // console.log('[Goals Widget] ?? animateProgress: currentProgress=' + currentProgress.toFixed(2) + '% ? target=' + targetPercentage.toFixed(2) + '% (diff=' + diff.toFixed(2) + '%)');
            
            // Si la diferencia es muy peque�a (<2%), actualizar INSTANT�NEAMENTE
            if(diff < 2) {
                currentProgress = targetPercentage;
                document.getElementById('bar-fill').style.width = currentProgress + '%';
                // console.log('[Goals Widget] ? Actualizaci�n INSTANT�NEA a', currentProgress.toFixed(2) + '%');
                return;
            }

            // Para diferencias peque�as (2-10%), animar muy r�pido
            if(diff < 10) {
                const steps = 3; // Solo 3 pasos
                const increment = (targetPercentage - currentProgress) / steps;
                
                progressInterval = setInterval(() => {
                    currentProgress += increment;

                    if((increment > 0 && currentProgress >= targetPercentage) ||
                       (increment < 0 && currentProgress <= targetPercentage)) {
                        currentProgress = targetPercentage;
                        clearInterval(progressInterval);
                    }

                    document.getElementById('bar-fill').style.width = currentProgress + '%';
                }, 10); // 3 pasos � 10ms = 30ms total
                return;
            }

            // Para diferencias grandes, animar r�pido pero suave
            const steps = Math.min(8, Math.ceil(diff / 5)); // M�ximo 8 pasos
            const increment = (targetPercentage - currentProgress) / steps;
            
            progressInterval = setInterval(() => {
                currentProgress += increment;

                if((increment > 0 && currentProgress >= targetPercentage) ||
                   (increment < 0 && currentProgress <= targetPercentage)) {
                    currentProgress = targetPercentage;
                    clearInterval(progressInterval);
                }

                document.getElementById('bar-fill').style.width = currentProgress + '%';
            }, 10); // 10ms por paso (m�ximo 80ms para diferencias grandes)
        }

        // Procesa un evento TikTok (com�n para cloud y local)
        function processTikTokEvent(ev) {
            try {
                if (!ev || !ev.type) {
                    console.warn('[Goals Widget] ?? Evento sin tipo:', ev);
                    return;
                }
                if (ev.type === 'like') {
                    const data = ev.data || ev;
                    let inc;
                    // ?? TikTok's totalLikeCount comes from DISTRIBUTED SHARDS
                    // and is NOT monotonic � un evento puede traer 162405 y el
                    // siguiente 137808 (de otro shard que iba atr�s). Si lo
                    // copiamos directo, el contador rebota visualmente.
                    // Soluci�n: solo aceptar totalLikeCount si AVANZA.
                    const reportedTotal = (data.totalLikeCount != null)
                        ? (parseInt(data.totalLikeCount, 10) || 0) : null;
                    const currentVal = parseInt(settings.current || 0, 10) || 0;
                    if (reportedTotal != null && reportedTotal > currentVal) {
                        inc = reportedTotal - currentVal;
                        settings.current = reportedTotal;
                    } else {
                        // El total reportado es viejo (o no lleg�). Usar el
                        // incremento del propio evento.
                        inc = parseInt(data.likeCount || data.increment || data.count || 1, 10) || 1;
                        settings.current = currentVal + inc;
                    }
                    let timesReached = 0;
                    let anyChanged = false;
                    while (settings.current >= settings.target && timesReached < 1000) {
                        timesReached++;
                        if (handleGoalReached()) anyChanged = true;
                        if (settings.whenReached === 'keep' || settings.whenReached === 'hide') break;
                    }
                    // Si la meta se alcanz� al menos una vez, animar y guardar
                    // UNA SOLA VEZ � sin importar si el while iter� 1 o 200
                    // veces. Antes cada iteraci�n disparaba animaci�n + save
                    // ? spam al worker + oscilaci�n visual.
                    if (timesReached > 0) {
                        playReachedAnimation();
                        if (anyChanged) saveGoalToServerDebounced();
                    }
                    updateDisplay();
                    maybeFlipAvatar(data, { increment: inc });
                }
            } catch (e) {
                console.error('[Goals Widget] ? Error procesando evento TikTok:', e);
                console.error('[Goals Widget] Stack:', e.stack);
            }
        }

        // Conectar a la fuente de eventos (cloud WSS o Socket.IO local)
        async function connectToServer() {
            if (__TC_IS_CLOUD) {
                __tcOnCloudEvent(processTikTokEvent);
                return;
            }
            if (__TC_IS_HTTPS_PAGE) {
                // HTTPS sin uid: no hay forma segura de conectar a localhost.
                console.warn('[Goals Widget] P�gina servida en HTTPS sin uid: no se puede conectar al servidor local.');
                return;
            }
            const baseUrl = __TC_LOCAL_BASE; // Puerto de la app

            const script = document.createElement('script');
            script.src = baseUrl + '/socket.io/socket.io.js';
            await new Promise((resolve) => {
                script.onload = () => resolve();
                script.onerror = (error) => {
                    console.error('[Goals Widget] ? Error cargando Socket.IO script:', error);
                    resolve();
                };
                document.head.appendChild(script);
            });

            if (typeof io !== 'undefined') {
                const socket = io(baseUrl);
                socket.on('connect_error', (error) => {
                    console.error('[Goals Widget] ? Error de conexi�n Socket.IO:', error);
                });
                socket.on('tiktok:event', processTikTokEvent);
            } else {
                console.error('[Goals Widget] ? Socket.IO no disponible despu�s de cargar el script');
            }
        }

        // Manejar cuando se alcanza el objetivo.
        // ?? Refactor anti-spam: esta funci�n SOLO modifica el estado
        // (target += originalTarget, hide del container, etc.). NO anima
        // ni guarda al servidor. La animaci�n + el save se hacen UNA SOLA
        // VEZ desde processTikTokEvent al salir del while loop, aunque la
        // meta se haya alcanzado N veces en una r�faga (current salt� de
        // 0 a 1.36M en un solo evento ? while loop ejecuta 272 iteraciones).
        // Antes cada iteraci�n llamaba saveGoalToServer y emit�a animaci�n
        // ? spam masivo al worker + oscilaci�n visual perpetua.
        function handleGoalReached() {
            const isCompact = settings.widgetType === 'compact';
            const container = isCompact
                ? document.getElementById('compact-card')
                : document.querySelector('.goals-bar-container');

            let goalChanged = false;

            switch(settings.whenReached) {
                case 'increase':
                    settings.target += settings.originalTarget;
                    goalChanged = true;
                    break;
                case 'double':
                    settings.target *= 2;
                    goalChanged = true;
                    break;
                case 'hide':
                    if(container) {
                        container.style.opacity = '0';
                        setTimeout(() => { container.style.display = 'none'; }, 500);
                    }
                    break;
                case 'keep':
                default:
                    break;
            }
            return goalChanged;
        }

        // Anima el container al alcanzar la meta. Llamado UNA vez tras el
        // while loop, no por cada iteraci�n.
        function playReachedAnimation() {
            const isCompact = settings.widgetType === 'compact';
            const container = isCompact
                ? document.getElementById('compact-card')
                : document.querySelector('.goals-bar-container');

            const reachAnimation = settings.reachAnimation || 'shake';
            if(container && reachAnimation !== 'none') {
                container.classList.add(reachAnimation);
                setTimeout(() => { container.classList.remove(reachAnimation); }, 1500);
            }
            if (isCompact && container) {
                container.classList.add('reached');
                setTimeout(() => container.classList.remove('reached'), 2000);
            }

            const shouldChange = settings.whenReached !== 'keep' && settings.whenReached !== 'hide';
            if(shouldChange) {
                const changeAnimation = settings.changeAnimation || 'flip';
                const animTarget = isCompact
                    ? container
                    : document.getElementById('bar-text');
                if(animTarget && changeAnimation !== 'none') {
                    animTarget.classList.add(changeAnimation);
                    setTimeout(() => { animTarget.classList.remove(changeAnimation); }, 1000);
                }
            }

            updateDisplay();
        }

        // Debounced wrapper: si se llama varias veces en <1s, solo el
        // �ltimo save se ejecuta. Evita spam al worker cuando el while
        // loop alcanzaba la meta N veces seguidas.
        let _saveDebounceTimer = null;
        function saveGoalToServerDebounced() {
            if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
            _saveDebounceTimer = setTimeout(() => {
                _saveDebounceTimer = null;
                saveGoalToServer();
            }, 1000);
        }

        // Guardar el goal actualizado al servidor
        async function saveGoalToServer() {
            try {
                // ? ENVIAR SOLO LAS KEYS DE ESTA M�TRICA (likes), no todo el config
                const partialConfig = {
                    goallikes_value: settings.target,
                    goallikes_title: settings.title || 'LIKES',
                    goallikes_whenReached: settings.whenReached || 'nothing',
                    goallikes_action: settings.action || {},
                    goallikes_styles: settings.styles || [],
                    goallikes_currentStyleIndex: settings.currentStyleIndex || 0,
                    _timestamp: Date.now()
                };
                
                if (__TC_IS_CLOUD) {
                    // Cloud: enviar via WSS al Worker (relay ? D1).
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
                console.error('[Goals Widget] ? Error guardando goal:', e);
            }
        }

        // Inicializar con retry
        // [log cleaned]
        // Intentar cargar la configuraci�n con retry (hasta 10 intentos, 200ms entre cada uno)
        let loadAttempts = 0;
        const maxAttempts = 10;
        
        async function initializeWithRetry() {
            loadAttempts++;
            const success = await loadConfig(true);
            
            if(success) {
                // [log cleaned]
                connectToServer();
            } else if(loadAttempts < maxAttempts) {
                // console.log(`[Goals Widget] ?? Reintentando carga (${loadAttempts}/${maxAttempts})...`);
                setTimeout(initializeWithRetry, 200);
            } else {
                console.warn('[Goals Widget] ?? No se pudo cargar la configuraci�n despu�s de', maxAttempts, 'intentos. Usando valores por defecto.');
                applySettings(); // Aplicar valores por defecto
                connectToServer();
            }
        }
        
        initializeWithRetry();

        // Variable para rastrear �ltimo timestamp
        let lastConfigTimestamp = settings._timestamp || 0;

        if (__TC_IS_CLOUD) {
            // Cloud: aplicamos cualquier config recibida, incluida la primera tard�a.
            __tcOnCloudConfig(() => {
                loadConfig(false);
            });
        } else if (!__TC_IS_HTTPS_PAGE) {
            // Local: polling cada 2s al config endpoint.
            setInterval(async () => {
                try {
                    const response = await fetch(__TC_LOCAL_BASE + '/api/goals/config');
                    const data = await response.json();
                    if (data.ok && data.config) {
                        const newTimestamp = data.config._timestamp || 0;
                        if (newTimestamp > lastConfigTimestamp) {
                            lastConfigTimestamp = newTimestamp;
                            loadConfig(false);
                        }
                    }
                } catch (e) { /* silent */ }
            }, 2000);
        }
        
        // ? El widget ahora se adapta autom�ticamente usando CSS responsive (width: 100%, height: 100%)
        // No se necesita escalado manual