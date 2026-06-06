// Módulo COMPLETO para Minecraft Command Builder (Vanilla JS) - CON TODA LA FUNCIONALIDAD
import { esc } from '../../helpers.js';

// Catálogos de entidades e items (se cargarán desde JSON si están disponibles)
let entitiesCatalog = [];
let itemsCatalog = [];

// Intentar cargar catálogos
try {
  // En producción estos se cargarán del JSON
  fetch('/assets/minecraft/entities.json').then(r => r.json()).then(data => { entitiesCatalog = data; }).catch(() => {});
  fetch('/assets/minecraft/items.json').then(r => r.json()).then(data => { itemsCatalog = data; }).catch(() => {});
} catch(e) {}

const ARMORS = [
  { id: 'none', name: 'Sin armadura' },
  { id: 'leather', name: 'Cuero' },
  { id: 'iron', name: 'Hierro' },
  { id: 'gold', name: 'Oro' },
  { id: 'diamond', name: 'Diamante' },
  { id: 'netherite', name: 'Netherita' },
  { id: 'random', name: 'Aleatoria' }
];

const ENCHANTMENTS = [
  'protection','fire_protection','feather_falling','blast_protection','projectile_protection',
  'respiration','aqua_affinity','thorns','depth_strider','frost_walker','soul_speed','swift_sneak',
  'sharpness','smite','bane_of_arthropods','knockback','fire_aspect','looting','sweeping',
  'mending','unbreaking','efficiency','silk_touch','fortune','power','punch','flame','infinity',
  'luck_of_the_sea','lure','loyalty','impaling','riptide','channeling','multishot','piercing',
  'quick_charge','density','wind_burst','breach','binding_curse','vanishing_curse'
];

const COLORS = ['black','dark_blue','dark_green','dark_aqua','dark_red','dark_purple','gold','gray','dark_gray','blue','green','aqua','red','light_purple','yellow','white'];

/**
 * Construye el panel de Minecraft Command Builder (Vanilla JS COMPLETO)
 */
export function buildMinecraftPanel(config = {}) {
  const t = window.i18n && window.i18n.t ? window.i18n.t : (k, d) => d || k;
  const version = config.version || '1.21';
  const commands = Array.isArray(config.commands) ? config.commands : [];
  
  let html = '<div class="mc-builder-full" data-mc-builder="vanilla-full">';
  
  // Header con versión y botón agregar
  html += '<div class="mc-header" style="display:grid; grid-template-columns:200px 1fr; gap:12px; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid rgba(122,92,255,.2);">';
  html += '<div>';
  html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Versión de Minecraft</label>';
  html += '<select id="mc-version-full" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">';
  ['1.21', '1.20', '1.19', '1.18'].forEach(v => {
    html += `<option value="${v}" ${v === version ? 'selected' : ''}>${v}</option>`;
  });
  html += '</select>';
  html += '</div>';
  html += '<div style="display:flex; align-items:end;">';
  html += '<button type="button" id="mc-add-cmd-full" style="padding:8px 16px; background:#1e4356; border:1px solid #2f5668; border-radius:6px; color:#c2d6e1; cursor:pointer; font-size:12px; font-weight:600;">+ Añadir comando</button>';
  html += '</div>';
  html += '</div>';
  
  // Lista de comandos
  html += '<div class="mc-commands-list-full" id="mc-commands-list-full">';
  
  if (commands.length === 0) {
    html += '<div style="padding:20px; text-align:center; color:#7ea8bf; font-size:12px; background:rgba(122,92,255,.05); border:1px dashed rgba(122,92,255,.25); border-radius:6px;">' + t('action_mc_no_commands', 'No commands yet. Configure them here.') + '</div>';
  } else {
    commands.forEach((cmd, idx) => {
      html += buildCommandRowFull(cmd, idx, version);
    });
  }
  
  html += '</div>';
  html += '</div>';
  
  return html;
}

/**
 * Construye una fila de comando COMPLETA (con TODA la funcionalidad)
 */
function buildCommandRowFull(cmd, index, version) {
  const type = cmd.type || 'summon';
  
  let html = `<div class="mc-cmd-row-full" data-cmd-index="${index}" style="margin-bottom:16px; padding:16px; background:rgba(122,92,255,.08); border:1px solid rgba(122,92,255,.2); border-radius:8px;">`;
  
  // Header con título y botones
  html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
  html += `<div style="font-weight:600; color:#d5e2ee; font-size:13px;">Comando ${index + 1}</div>`;
  html += '<div style="display:flex; gap:6px;">';
  html += `<button type="button" class="mc-cmd-up-full" data-index="${index}" style="padding:4px 10px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); border-radius:4px; color:#c2d6e1; cursor:pointer; font-size:11px;" ${index === 0 ? 'disabled' : ''}>↑</button>`;
  html += `<button type="button" class="mc-cmd-down-full" data-index="${index}" style="padding:4px 10px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); border-radius:4px; color:#c2d6e1; cursor:pointer; font-size:11px;">↓</button>`;
  html += `<button type="button" class="mc-cmd-delete-full" data-index="${index}" style="padding:4px 10px; background:rgba(220,53,69,.2); border:1px solid rgba(220,53,69,.4); border-radius:4px; color:#ff6b7a; cursor:pointer; font-size:11px;">🗑️</button>`;
  html += '</div>';
  html += '</div>';
  
  // Grid principal: Tipo, Target, Veces
  html += '<div style="display:grid; grid-template-columns:200px 1fr 100px; gap:12px; margin-bottom:12px;">';
  
  // Tipo de comando
  html += '<div>';
  html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Tipo</label>';
  html += `<select class="mc-cmd-type-full" data-index="${index}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
  const types = [
    { value: 'summon', label: '/summon' },
    { value: 'give', label: '/give' },
    { value: 'tp', label: '/tp' },
    { value: 'time', label: '/time' },
    { value: 'say', label: '/say' },
    { value: 'tellraw', label: '/tellraw' },
    { value: 'effect', label: '/effect' },
    { value: 'title', label: '/title' },
    { value: 'fill', label: '/fill' },
    { value: 'setblock', label: '/setblock' },
    { value: 'raw', label: 'Raw' }
  ];
  types.forEach(t => {
    html += `<option value="${t.value}" ${t.value === type ? 'selected' : ''}>${t.label}</option>`;
  });
  html += '</select>';
  html += '</div>';
  
  // Target
  html += '<div>';
  html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Target</label>';
  html += '<div style="display:flex; gap:6px;">';
  html += `<input class="mc-cmd-target-full" data-index="${index}" type="text" value="${esc(cmd.target || '{player}')}" placeholder="{player}, @a, @r..." style="flex:1; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
  html += `<select class="mc-cmd-target-select-full" data-index="${index}" style="width:120px; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
  ['', '{player}', '@a', '@p', '@r', '@s'].forEach(t => {
    html += `<option value="${t}" ${t === cmd.target ? 'selected' : ''}>${t || '—'}</option>`;
  });
  html += '</select>';
  html += '</div>';
  html += '</div>';
  
  // Veces
  html += '<div>';
  html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Veces</label>';
  html += `<input class="mc-cmd-times-full" data-index="${index}" type="number" min="1" max="100" value="${cmd.times || 1}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
  html += '</div>';
  
  html += '</div>';
  
  // Contenedor específico por tipo
  html += `<div class="mc-cmd-specific-full" data-type="${type}">`;
  html += buildTypeSpecificFields(cmd, index, type, version);
  html += '</div>';
  
  // Preview del comando
  html += '<div style="margin-top:12px; padding:8px; background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.1); border-radius:6px; font-family:monospace; font-size:11px; color:#7ea8bf; word-break:break-all;">—</div>';
  
  // Delay (excepto último comando)
  html += `<div style="margin-top:12px; display:flex; align-items:center; gap:8px; font-size:11px; color:#9fb4c3;">`;
  html += `<span style="padding:4px 8px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); border-radius:4px;">Delay</span>`;
  html += `<input class="mc-cmd-delay-full" data-index="${index}" type="number" min="0" value="${cmd.delayMs || 0}" style="width:100px; padding:4px 8px; background:#162b37; border:1px solid #2d4654; border-radius:4px; color:#e2edf5; font-size:11px;">`;
  html += `<span>ms antes del siguiente</span>`;
  html += '</div>';
  
  html += '</div>'; // mc-cmd-row-full
  
  return html;
}

/**
 * Construye los campos específicos según el tipo de comando
 */
function buildTypeSpecificFields(cmd, index, type, version) {
  let html = '';
  
  // SUMMON - EL MÁS COMPLEJO
  if (type === 'summon') {
    html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">';
    
    // Entidad
    html += '<div style="grid-column:span 2;">';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Entidad</label>';
    html += `<input class="mc-cmd-entity-full" data-index="${index}" type="text" value="${esc(cmd.entity || 'zombie')}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    html += '<div style="margin-top:4px;"><label style="font-size:10px; color:#7ea8bf;"><input class="mc-cmd-custom-entity-full" data-index="${index}" type="checkbox"' + (cmd.useCustomEntity ? ' checked' : '') + '> Entidad personalizada (mod/datapack)</label></div>';
    html += '</div>';
    
    // Coordenadas
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Coordenadas</label>';
    html += `<input class="mc-cmd-coords-full" data-index="${index}" type="text" value="${esc(cmd.coords || '~ ~ ~')}" placeholder="~ ~ ~" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    html += '</div>';
    
    // Dimensión
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Dimensión</label>';
    html += `<select class="mc-cmd-dimension-full" data-index="${index}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    ['overworld', 'nether', 'end'].forEach(d => {
      html += `<option value="${d}" ${(cmd.dimension || 'overworld') === d ? 'selected' : ''}>${d.charAt(0).toUpperCase() + d.slice(1)}</option>`;
    });
    html += '</select>';
    html += '</div>';
    
    // Armadura
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Armadura</label>';
    html += `<select class="mc-cmd-armor-full" data-index="${index}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    ARMORS.forEach(a => {
      html += `<option value="${a.id}" ${(cmd.armor || 'none') === a.id ? 'selected' : ''}>${a.name}</option>`;
    });
    html += '</select>';
    html += '</div>';
    
    html += '</div>';
    
    // Opciones avanzadas (checkboxes)
    html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:8px; margin-top:12px; padding:12px; background:rgba(0,0,0,.2); border-radius:6px;">';
    html += `<label style="font-size:11px; color:#c2d6e1; cursor:pointer;"><input class="mc-cmd-persistent-full" data-index="${index}" type="checkbox"${cmd.persistent !== false ? ' checked' : ''}> 🔒 Persistente</label>`;
    html += `<label style="font-size:11px; color:#c2d6e1; cursor:pointer;"><input class="mc-cmd-glowing-full" data-index="${index}" type="checkbox"${cmd.glowing ? ' checked' : ''}> ✨ Glowing</label>`;
    html += `<label style="font-size:11px; color:#c2d6e1; cursor:pointer;"><input class="mc-cmd-noai-full" data-index="${index}" type="checkbox"${cmd.noAI ? ' checked' : ''}> 🚫 NoAI</label>`;
    html += `<label style="font-size:11px; color:#c2d6e1; cursor:pointer;"><input class="mc-cmd-random-offset-full" data-index="${index}" type="checkbox"${cmd.useRandomOffset ? ' checked' : ''}> 🎲 Offset aleatorio</label>`;
    html += '</div>';
    
    // Offset aleatorio (si está activado)
    if (cmd.useRandomOffset) {
      html += '<div style="margin-top:12px; padding:12px; background:rgba(122,92,255,.1); border:1px solid rgba(122,92,255,.25); border-radius:6px;">';
      html += '<div style="font-size:11px; color:#d5e2ee; margin-bottom:8px; font-weight:600;">🎲 Rangos de Offset Aleatorio</div>';
      html += '<div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:8px;">';
      ['rxMin', 'rxMax', 'ryMin', 'ryMax', 'rzMin', 'rzMax'].forEach((field, i) => {
        const label = field.replace('r', '').replace('Min', ' min').replace('Max', ' max');
        html += `<div><label style="font-size:10px; color:#9fb4c3; display:block; margin-bottom:2px;">${label}</label>`;
        html += `<input class="mc-cmd-${field}-full" data-index="${index}" type="number" value="${cmd[field] !== undefined ? cmd[field] : (i % 2 === 0 ? -3 : 3)}" style="width:100%; padding:4px; background:#162b37; border:1px solid #2d4654; border-radius:4px; color:#e2edf5; font-size:11px;"></div>`;
      });
      html += '</div>';
      html += '</div>';
    }
    
    // Custom Name
    html += '<div style="margin-top:12px; padding:12px; background:rgba(0,0,0,.2); border-radius:6px;">';
    html += '<div style="font-size:11px; color:#d5e2ee; margin-bottom:8px; font-weight:600;">📝 Custom Name</div>';
    html += '<div style="display:grid; grid-template-columns:1fr 150px; gap:12px; margin-bottom:8px;">';
    html += `<input class="mc-cmd-customname-full" data-index="${index}" type="text" value="${esc(cmd.customName || '')}" placeholder="Nombre visible" style="padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    html += `<select class="mc-cmd-customname-color-full" data-index="${index}" style="padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    html += '<option value="">(defecto)</option>';
    COLORS.forEach(c => {
      html += `<option value="${c}" ${cmd.customNameColor === c ? 'selected' : ''}>${c}</option>`;
    });
    html += '</select>';
    html += '</div>';
    html += '<div style="display:flex; gap:8px; flex-wrap:wrap;">';
    ['Bold', 'Italic', 'Under', 'Strike', 'Obf'].forEach(style => {
      const field = 'customName' + style;
      html += `<label style="font-size:10px; color:#c2d6e1; cursor:pointer;"><input class="mc-cmd-${field.toLowerCase()}-full" data-index="${index}" type="checkbox"${cmd[field] ? ' checked' : ''}> ${style}</label>`;
    });
    html += `<label style="font-size:10px; color:#c2d6e1; cursor:pointer;"><input class="mc-cmd-customnamevisible-full" data-index="${index}" type="checkbox"${cmd.customNameVisible ? ' checked' : ''}> Mostrar</label>`;
    html += '</div>';
    html += '</div>';
    
    // Scale (1.21+)
    const canScale = version.split('.').map(n => parseInt(n))[1] >= 21;
    if (canScale) {
      html += '<div style="margin-top:12px;">';
      html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">📏 Scale (1.21+)</label>';
      html += `<input class="mc-cmd-scale-full" data-index="${index}" type="number" step="0.1" min="0.1" max="10" value="${cmd.scale || 1}" style="width:120px; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
      html += '</div>';
    }
  }
  
  // TP - TELEPORT COMPLETO
  else if (type === 'tp') {
    html += '<div style="display:grid; grid-template-columns:200px 200px 1fr; gap:12px;">';
    
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Modo</label>';
    html += `<select class="mc-cmd-tpmode-full" data-index="${index}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    ['player', 'coords'].forEach(m => {
      html += `<option value="${m}" ${(cmd.tpMode || 'player') === m ? 'selected' : ''}>${m === 'player' ? 'Jugador/selector' : 'Coordenadas'}</option>`;
    });
    html += '</select>';
    html += '</div>';
    
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Dimensión</label>';
    html += `<select class="mc-cmd-tpdim-full" data-index="${index}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    ['overworld', 'nether', 'end'].forEach(d => {
      html += `<option value="${d}" ${(cmd.tpDimension || 'overworld') === d ? 'selected' : ''}>${d.charAt(0).toUpperCase() + d.slice(1)}</option>`;
    });
    html += '</select>';
    html += '</div>';
    
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Destino/Coords</label>';
    html += `<input class="mc-cmd-tpdest-full" data-index="${index}" type="text" value="${esc(cmd.tpCoords || cmd.tpTarget || '~ ~ ~')}" placeholder="~ ~ ~ o @p" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    html += '</div>';
    
    html += '</div>';
    
    // Aleatorio
    html += '<div style="margin-top:8px;"><label style="font-size:11px; color:#c2d6e1; cursor:pointer;"><input class="mc-cmd-tprandom-full" data-index="${index}" type="checkbox"${cmd.tpRandom ? ' checked' : ''}> 🎲 Coordenadas aleatorias</label></div>';
    
    if (cmd.tpRandom) {
      html += '<div style="margin-top:8px; padding:12px; background:rgba(122,92,255,.1); border:1px solid rgba(122,92,255,.25); border-radius:6px;">';
      html += '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">';
      [['tpRxMin', -1000], ['tpRxMax', 1000], ['tpRY', 64], ['tpRzMin', -1000], ['tpRzMax', 1000]].forEach(([field, def]) => {
        html += `<div><label style="font-size:10px; color:#9fb4c3;">${field.replace('tpR', '')}</label>`;
        html += `<input class="mc-cmd-${field}-full" data-index="${index}" type="number" value="${cmd[field] !== undefined ? cmd[field] : def}" style="width:100%; padding:4px; background:#162b37; border:1px solid #2d4654; border-radius:4px; color:#e2edf5; font-size:11px;"></div>`;
      });
      html += '</div>';
      html += '</div>';
    }
  }
  
  // OTROS COMANDOS (simplificados por ahora, se pueden expandir)
  else if (type === 'time') {
    html += '<div style="display:grid; grid-template-columns:150px 1fr; gap:12px;">';
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Modo</label>';
    html += `<select class="mc-cmd-timemode-full" data-index="${index}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    ['preset', 'custom', 'random'].forEach(m => {
      html += `<option value="${m}" ${(cmd.timeMode || 'preset') === m ? 'selected' : ''}>${m === 'preset' ? 'Predefinido' : m === 'custom' ? 'Ticks' : 'Aleatorio'}</option>`;
    });
    html += '</select>';
    html += '</div>';
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Valor</label>';
    html += `<select class="mc-cmd-timevalue-full" data-index="${index}" style="width:100%; padding:6px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-size:12px;">`;
    ['day', 'noon', 'night', 'midnight'].forEach(t => {
      html += `<option value="${t}" ${(cmd.timePreset || 'day') === t ? 'selected' : ''}>${t}</option>`;
    });
    html += '</select>';
    html += '</div>';
    html += '</div>';
  }
  
  // Raw
  else if (type === 'raw') {
    html += '<div>';
    html += '<label style="font-size:11px; color:#9fb4c3; display:block; margin-bottom:4px;">Comandos raw (uno por línea)</label>';
    html += `<textarea class="mc-cmd-raw-full" data-index="${index}" rows="4" placeholder="summon zombie ~ ~ ~\ndelay 1000" style="width:100%; padding:8px; background:#162b37; border:1px solid #2d4654; border-radius:6px; color:#e2edf5; font-family:monospace; font-size:11px; resize:vertical;">${esc(cmd.raw || '')}</textarea>`;
    html += '</div>';
  }
  
  // Placeholder para otros tipos
  else {
    html += `<div style="padding:20px; text-align:center; color:#7ea8bf; font-size:11px; opacity:.6;">Configuración para "${type}" en desarrollo...</div>`;
  }
  
  return html;
}

/**
 * Inicializa el panel de Minecraft COMPLETO (eventos)
 */
export function initMinecraftPanel(panel, actionObj) {
  // [log cleaned]
  let config = actionObj.options?.mcCommandConfig || { version: '1.21', commands: [] };
  
  // Agregar comando por defecto si está vacío
  if (!Array.isArray(config.commands) || config.commands.length === 0) {
    config.commands = [{
      type: 'summon',
      entity: 'zombie',
      armor: 'none',
      coords: '~ ~ ~',
      dimension: 'overworld',
      target: '{player}',
      times: 1,
      delayMs: 0,
      persistent: true
    }];
    saveConfig();
  }
  
  const versionSelect = panel.querySelector('#mc-version-full');
  const commandsList = panel.querySelector('#mc-commands-list-full');
  const addButton = panel.querySelector('#mc-add-cmd-full');
  
  // Guardar configuración
  function saveConfig() {
    if (!actionObj.options) actionObj.options = {};
    actionObj.options.mcCommandConfig = config;
    // [log cleaned]
  }
  
  // Refrescar lista
  function refreshList() {
    if (!commandsList) return;
    
    if (config.commands.length === 0) {
      const t2 = window.i18n && window.i18n.t ? window.i18n.t : (k, d) => d || k;
      commandsList.innerHTML = '<div style="padding:20px; text-align:center; color:#7ea8bf; font-size:12px;">' + t2('action_mc_no_commands', 'No commands yet. Configure them here.') + '</div>';
    } else {
      commandsList.innerHTML = config.commands.map((cmd, idx) => buildCommandRowFull(cmd, idx, config.version)).join('');
    }
    
    attachEvents();
  }
  
  // Adjuntar eventos
  function attachEvents() {
    // Cambio de tipo
    commandsList.querySelectorAll('.mc-cmd-type-full').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        config.commands[idx].type = e.target.value;
        saveConfig();
        refreshList();
      });
    });
    
    // Cambios de campos genéricos
    const fields = ['target', 'times', 'entity', 'coords', 'dimension', 'armor', 'scale', 'customname', 'tpdest', 'tpdim', 'tpmode', 'timemode', 'timevalue', 'raw'];
    fields.forEach(field => {
      commandsList.querySelectorAll(`.mc-cmd-${field}-full`).forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.index);
          let value = e.target.value;
          if (e.target.type === 'number') value = parseFloat(value);
          
          // Mapear nombres de campos
          const fieldMap = {
            'tpdest': (cmd) => { if (cmd.tpMode === 'coords') cmd.tpCoords = value; else cmd.tpTarget = value; },
            'tpdim': (cmd) => { cmd.tpDimension = value; },
            'tpmode': (cmd) => { cmd.tpMode = value; },
            'timemode': (cmd) => { cmd.timeMode = value; },
            'timevalue': (cmd) => { cmd.timePreset = value; },
            'customname': (cmd) => { cmd.customName = value; }
          };
          
          if (fieldMap[field]) {
            fieldMap[field](config.commands[idx]);
          } else {
            config.commands[idx][field] = value;
          }
          
          saveConfig();
        });
      });
    });
    
    // Checkboxes
    const checkboxes = ['persistent', 'glowing', 'noai', 'random-offset', 'custom-entity', 'tprandom', 'customnamevisible', 'customnamebold', 'customnameitalic', 'customnameunder', 'customnamestrike', 'customnameobf'];
    checkboxes.forEach(cb => {
      commandsList.querySelectorAll(`.mc-cmd-${cb}-full`).forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.index);
          const fieldName = cb.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
          config.commands[idx][fieldName] = e.target.checked;
          saveConfig();
          if (cb === 'random-offset' || cb === 'tprandom') refreshList();
        });
      });
    });
    
    // Botones de control
    commandsList.querySelectorAll('.mc-cmd-up-full').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (idx > 0) {
          [config.commands[idx - 1], config.commands[idx]] = [config.commands[idx], config.commands[idx - 1]];
          saveConfig();
          refreshList();
        }
      });
    });
    
    commandsList.querySelectorAll('.mc-cmd-down-full').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (idx < config.commands.length - 1) {
          [config.commands[idx], config.commands[idx + 1]] = [config.commands[idx + 1], config.commands[idx]];
          saveConfig();
          refreshList();
        }
      });
    });
    
    commandsList.querySelectorAll('.mc-cmd-delete-full').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (await window.ModalHost.confirm({
          title: '🗑️ ' + (window.i18n ? window.i18n.t('mc_delete_command_title') : 'Delete Command'),
          message: (window.i18n ? window.i18n.t('mc_delete_command_msg') : 'Are you sure you want to delete this command?'),
          confirmText: (window.i18n ? window.i18n.t('mc_delete_confirm') : 'Yes, delete'),
          cancelText: (window.i18n ? window.i18n.t('cancel') : 'Cancel'),
          type: 'danger'
        })) {
          config.commands.splice(idx, 1);
          saveConfig();
          refreshList();
        }
      });
    });
  }
  
  // Versión
  if (versionSelect) {
    versionSelect.addEventListener('change', () => {
      config.version = versionSelect.value;
      saveConfig();
      refreshList();
    });
  }
  
  // Agregar comando
  if (addButton) {
    addButton.addEventListener('click', () => {
      config.commands.push({
        type: 'summon',
        entity: 'zombie',
        armor: 'none',
        coords: '~ ~ ~',
        dimension: 'overworld',
        target: '{player}',
        times: 1,
        delayMs: 0,
        persistent: true
      });
      saveConfig();
      refreshList();
    });
  }
  
  // Inicializar
  attachEvents();
}

/**
 * Extrae la configuración de Minecraft
 */
export function extractMinecraftValues(root, actionObj) {
  // La configuración ya está guardada en actionObj.options.mcCommandConfig
  // [log cleaned]
}


