/**
 * Configuraciones compartidas para widgets
 * Single Source of Truth para tamaños y propiedades por defecto
 */

const WIDGET_DEFAULTS = {
  // Widgets de engagement (300x200)
  'top-likes': {
    width: 500,
    height: 600,
    layer: 2,
    category: 'engagement'
  },
  'top-donors': {
    width: 500,
    height: 600,
    layer: 2,
    category: 'engagement'
  },
  'top-comments': {
    width: 500,
    height: 600,
    layer: 2,
    category: 'engagement'
  },
  'top-rotation': {
    width: 500,
    height: 600,
    layer: 2,
    category: 'engagement'
  },
  'top-points': {
    width: 500,
    height: 600,
    layer: 2,
    category: 'engagement'
  },
  'top-gift': {
    width: 300,
    height: 200,
    layer: 2,
    category: 'gifts'
  },
  
  // Widgets de alertas y efectos
  'gift-alert': {
    width: 1080,
    height: 540, // Tamaño amplio para animaciones de dirigible con suficiente espacio
    layer: 1,
    category: 'alerts'
  },
  'gift-cannon': {
    width: 1920,
    height: 1080, // Pantalla completa para física del cañón
    layer: 1,
    category: 'effects'
  },
  'firework': {
    width: 1920,
    height: 1080, // Pantalla completa para fuegos artificiales
    layer: 1,
    category: 'effects'
  },
  'social-media-rotator': {
    width: 400,
    height: 120,
    layer: 1,
    category: 'engagement'
  },
  'like-fountain': {
    width: 1920,
    height: 1080, // Pantalla completa para corazones volando
    layer: 1,
    category: 'effects'
  },
  'combo': {
    width: 350,
    height: 200,
    layer: 1,
    category: 'effects'
  },
  'level-up': {
    width: 400,
    height: 250, // Más grande para anuncios
    layer: 1,
    category: 'alerts'
  },
  
  // Widgets interactivos
  'chat': {
    width: 300,
    height: 400, // Más alto para mostrar más mensajes
    layer: 5,
    category: 'interaction'
  },
  'timer': {
    width: 250,
    height: 150, // Más compacto
    layer: 4,
    category: 'tools'
  },
  'poll': {
    width: 350,
    height: 250,
    layer: 3,
    category: 'interaction'
  },
  
  // Widgets de juegos y competencias
  'gift-battle': {
    width: 400,
    height: 300, // Más grande para mostrar equipos
    layer: 2,
    category: 'games'
  },
  'auction': {
    width: 350,
    height: 250,
    layer: 2,
    category: 'games'
  },
  'winlife': {
    width: 200,
    height: 150, // Compacto para marcador
    layer: 3,
    category: 'games'
  },
  'ranks': {
    width: 1920,
    height: 1080,
    layer: 3,
    category: 'engagement'
  },
  'roulette': {
    width: 300,
    height: 300, // Cuadrado para la ruleta
    layer: 2,
    category: 'games'
  },
  'gift-gallery': {
    width: 500,
    height: 150, // Carrusel horizontal
    layer: 2,
    category: 'engagement'
  },
  'gaming-hud': {
    width: 1080,
    height: 500, // HUD gaming con soporte multi-fila y carrusel
    layer: 3,
    category: 'games'
  }
};

/**
 * Configuraciones de canvas
 */
const CANVAS_DEFAULTS = {
  vertical: {
    real: { w: 1080, h: 1920 },
    display: { w: 360, h: 640 }
  },
  horizontal: {
    real: { w: 1920, h: 1080 },
    display: { w: 640, h: 360 }
  }
};

/**
 * Obtener configuración por defecto de un widget
 */
function getWidgetDefaults(widgetKey) {
  return WIDGET_DEFAULTS[widgetKey] || {
    width: 300,
    height: 200,
    layer: 5,
    category: 'general'
  };
}

/**
 * Obtener configuración de canvas
 */
function getCanvasDefaults(orientation) {
  return CANVAS_DEFAULTS[orientation] || CANVAS_DEFAULTS.vertical;
}

/**
 * Proxy para imágenes de TikTok (evitar errores 403)
 * Convierte URLs de TikTok CDN a URLs del proxy local
 */
function proxyTikTokImage(url) {
  if (!url) return url;
  
  const urlStr = String(url);
  
  // Detectar URLs de TikTok CDN
  if (urlStr.includes('tiktokcdn') || urlStr.includes('tiktok.com')) {
    // Obtener el puerto del servidor
    let port = 43123; // Puerto por defecto
    try {
      if (typeof window !== 'undefined' && window.location) {
        port = window.location.port || 43123;
      }
    } catch(e) {}
    
    // Construir URL del proxy
    const proxyUrl = `http://127.0.0.1:${port}/api/proxy-image?url=${encodeURIComponent(urlStr)}`;
    return proxyUrl;
  }
  
  // Si no es de TikTok, devolver la URL original
  return url;
}

// Exportar para Node.js (servidor)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WIDGET_DEFAULTS,
    CANVAS_DEFAULTS,
    getWidgetDefaults,
    getCanvasDefaults,
    proxyTikTokImage
  };
}

// Exportar para navegador (cliente)
if (typeof window !== 'undefined') {
  window.WidgetDefaults = {
    WIDGET_DEFAULTS,
    CANVAS_DEFAULTS,
    getWidgetDefaults,
    getCanvasDefaults,
    proxyTikTokImage
  };
}
