import React, { useEffect, useMemo, useState } from 'react';
import entitiesCatalog from '../../assets/minecraft/entities.json';
import itemsCatalog from '../../assets/minecraft/items.json';

const ARMORS = [
  { id:'none', name:'Sin armadura' },
  { id:'leather', name:'Cuero' },
  { id:'iron', name:'Hierro' },
  { id:'gold', name:'Oro' },
  { id:'diamond', name:'Diamante' },
  { id:'netherite', name:'Netherita' },
  { id:'random', name:'Aleatoria' },
];

// Lista de todos los encantamientos conocidos (1.20/1.21+)
const ENCHANTMENTS = [
  // Armadura
  'protection','fire_protection','feather_falling','blast_protection','projectile_protection','respiration','aqua_affinity','thorns','depth_strider','frost_walker','soul_speed','swift_sneak','binding_curse',
  // Armas
  'sharpness','smite','bane_of_arthropods','knockback','fire_aspect','looting','sweeping','mending','unbreaking','vanishing_curse',
  // Herramientas
  'efficiency','silk_touch','fortune',
  // Arco
  'power','punch','flame','infinity',
  // Caña de pescar
  'luck_of_the_sea','lure',
  // Tridente
  'loyalty','impaling','riptide','channeling',
  // Ballesta
  'multishot','piercing','quick_charge',
  // 1.21+ (Maza)
  'density','wind_burst','breach'
];

const GAMERULES = [
  'keepInventory', 'mobGriefing', 'doDaylightCycle', 'doWeatherCycle', 'doMobSpawning',
  'doFireTick', 'fallDamage', 'fireDamage', 'drowningDamage', 'naturalRegeneration',
  'doImmediateRespawn', 'showDeathMessages', 'doInsomnia', 'randomTickSpeed', 'spawnRadius',
  'playersSleepingPercentage', 'commandBlockOutput', 'doTraderSpawning', 'doPatrolSpawning',
  'disableRaids'
];

const EFFECTS = [
  'speed', 'slowness', 'haste', 'mining_fatigue', 'strength', 'instant_health',
  'instant_damage', 'jump_boost', 'nausea', 'regeneration', 'resistance',
  'fire_resistance', 'water_breathing', 'invisibility', 'blindness', 'night_vision',
  'hunger', 'weakness', 'poison', 'wither', 'health_boost', 'absorption',
  'saturation', 'glowing', 'levitation', 'luck', 'bad_luck', 'slow_falling',
  'conduit_power', 'dolphins_grace', 'bad_omen', 'hero_of_the_village',
  'darkness', 'trial_omen', 'raid_omen', 'wind_charged', 'weaving', 'oozing',
  'infested'
];

const TARGETLESS_TYPES = new Set(['time', 'weather', 'gamerule', 'difficulty', 'say', 'raw']);

const TEXT_PLACEHOLDERS = [
  '{nickname}', '{username}', '{user}', '{giftname}', '{repeatcount}',
  '{coins}', '{coins_total}', '{likecount}', '{comment}'
];

function appendPlaceholder(value, token){
  const current = String(value || '');
  if(!current) return token;
  return /\s$/.test(current) ? `${current}${token}` : `${current} ${token}`;
}

function PlaceholderChips({ onPick }){
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      <span className="text-[10px] text-slate-400">Placeholders</span>
      {TEXT_PLACEHOLDERS.map(token => (
        <button
          key={token}
          type="button"
          onClick={() => onPick?.(token)}
          title={token}
          className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 font-mono text-[10px] leading-none text-violet-200 hover:bg-violet-500/20"
        >
          {token}
        </button>
      ))}
    </div>
  );
}

function makeBuilderId(){
  return `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function withBuiltCommand(entry, version){
  const next = { ...(entry || {}) };
  if(!next._builderId) next._builderId = makeBuilderId();
  if(!next.type) next.type = 'summon';
  if(next.delayMs == null) next.delayMs = 0;
  try { next.command = buildCommandString({ ...next, version }); }
  catch(_e) { next.command = next.raw || next.command || ''; }
  return next;
}

function normalizeBuilderParams(params){
  const p = params || {};
  const version = p.version || '1.21';
  const commands = Array.isArray(p.commands) ? p.commands.map(c => withBuiltCommand(c, version)) : [];
  return { ...p, version, commands };
}

function ImgOption({ img, title, subtitle }){
  return (
    <div className="flex items-center gap-2">
      {img && <img src={img} alt={title} className="w-6 h-6 object-contain" />}
      <div className="truncate">
        <div className="text-xs">{title}</div>
        {subtitle && <div className="text-[10px] opacity-60 -mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

function jsonTextComponent({ text, color, bold, italic, underlined, strikethrough, obfuscated, font }){
  const o = { text: String(text||'') };
  if(color) o.color = String(color);
  if(bold) o.bold = true;
  if(italic) o.italic = true;
  if(underlined) o.underlined = true;
  if(strikethrough) o.strikethrough = true;
  if(obfuscated) o.obfuscated = true;
  if(font) o.font = String(font);
  return JSON.stringify(o);
}

function buildSummonNbt({ entity, armor, scale, version, customName, customNameColor, customNameBold, customNameItalic, customNameUnder, customNameStrike, customNameObf, customNameVisible, glowing, noAI, fuseTicks, persistent, wardenNoBurrow, wardenDigCooldownTtl }){
  const tagParts = [];
  const entId = String(entity||'');
  const isTnt = entId === 'tnt' || entId === 'minecraft:tnt';
  if(persistent){ tagParts.push('PersistenceRequired:1b'); }
  if(glowing) tagParts.push('Glowing:1b');
  if(!isTnt && noAI) tagParts.push('NoAI:1b');
  if(customName && String(customName).trim()){
    // For TNT only support text + color (ignore styles)
    const comp = jsonTextComponent({
      text: customName,
      color: customNameColor,
      bold: isTnt ? false : customNameBold,
      italic: isTnt ? false : customNameItalic,
      underlined: isTnt ? false : customNameUnder,
      strikethrough: isTnt ? false : customNameStrike,
      obfuscated: isTnt ? false : customNameObf
    });
    // Use single quotes around the JSON to reduce escaping
    tagParts.push(`CustomName:'${comp}'`);
    if(!isTnt && customNameVisible) tagParts.push('CustomNameVisible:1b');
  }
  // TNT fuse (in ticks). Only apply for TNT entity
  if(isTnt && fuseTicks!=null && fuseTicks!=='' && !isNaN(Number(fuseTicks))){
    const t = Math.max(0, Math.min(6000, parseInt(fuseTicks)||0));
    tagParts.push(`Fuse:${t}s`);
  }
  // Armor/weapon equipment
  if(!isTnt && armor && armor !== 'none'){
    const pick = (arr)=> arr[Math.floor(Math.random()*arr.length)];
    const byId = {
      leather: { helmet:'leather_helmet', chest:'leather_chestplate', legs:'leather_leggings', boots:'leather_boots', weapon:'stick' },
      iron: { helmet:'iron_helmet', chest:'iron_chestplate', legs:'iron_leggings', boots:'iron_boots', weapon:'iron_sword' },
      gold: { helmet:'golden_helmet', chest:'golden_chestplate', legs:'golden_leggings', boots:'golden_boots', weapon:'golden_sword' },
      diamond: { helmet:'diamond_helmet', chest:'diamond_chestplate', legs:'diamond_leggings', boots:'diamond_boots', weapon:'diamond_sword' },
      netherite: { helmet:'netherite_helmet', chest:'netherite_chestplate', legs:'netherite_leggings', boots:'netherite_boots', weapon:'netherite_sword' }
    };
    const keys = Object.keys(byId);
    // Build per-slot items in correct NBT order: [boots, leggings, chestplate, helmet]
    let boots, legs, chest, helmet, weapon;
    if(armor === 'random'){
      // Randomize each slot independently and weapon from a pool
      const rand = ()=> byId[pick(keys)];
      boots = rand().boots; legs = rand().legs; chest = rand().chest; helmet = rand().helmet;
      const weaponPool = ['wooden_sword','stone_sword','iron_sword','golden_sword','diamond_sword','netherite_sword'];
      weapon = pick(weaponPool);
    } else {
      const set = byId[armor] || byId.iron;
      boots = set.boots; legs = set.legs; chest = set.chest; helmet = set.helmet; weapon = set.weapon;
    }
    const armorItems = [`{id:\"minecraft:${boots}\",Count:1}`, `{id:\"minecraft:${legs}\",Count:1}`, `{id:\"minecraft:${chest}\",Count:1}`, `{id:\"minecraft:${helmet}\",Count:1}`];
    tagParts.push(`ArmorItems:[${armorItems.join(',')}]`);
    tagParts.push('ArmorDropChances:[0.0F,0.0F,0.0F,0.0F]');
    if(weapon){
      const mainHand = `{id:\"minecraft:${weapon}\",Count:1}`;
      tagParts.push(`HandItems:[${mainHand},{}` + ']');
      tagParts.push('HandDropChances:[0.0F,0.0F]');
    }
  }
  // 1.21 scale option (custom data pack attribute on many servers uses minecraft:scale; vanilla has data component for some entities). We'll include if version >= 1.21 and scale provided.
  const vOk = (()=>{
    try { const v=(version||'').split('.').map(n=>parseInt(n)||0); return (v[0]>1) || (v[0]===1 && v[1]>=21); } catch { return false; }
  })();
  if(vOk && (scale!=null) && scale!=='' && !isNaN(Number(scale))){
    // Many servers use "Attributes" or data components; use minecraft:generic.scale if datapack, else fallback to custom tag recognized by plugins
    const s = Math.max(0.1, Math.min(10, Number(scale)));
    // Try new data component syntax (1.20.5+ experimental): components:{"minecraft:scale": { value: s }} — not standard yet everywhere, so fallback to Attributes
    tagParts.push(`Attributes:[{Name:"minecraft:generic.scale",Base:${s}}]`);
  }
  // Warden: Brain memories (dig_cooldown TTL configurable; is_emerging fixed if enabled)
  if((entId==='warden'||entId==='minecraft:warden')){
    const enabled = !!wardenNoBurrow;
    const ttlVal = (wardenDigCooldownTtl!=null && !isNaN(Number(wardenDigCooldownTtl))) ? Math.max(1, parseInt(wardenDigCooldownTtl)||1200) : (enabled ? 1200 : null);
    const mems = [];
    if(ttlVal!=null){ mems.push(`\"minecraft:dig_cooldown\":{value:{},ttl:${ttlVal}L}`); }
    if(enabled){ mems.push(`\"minecraft:is_emerging\":{value:{},ttl:85L}`); }
    if(mems.length){ tagParts.push(`Brain:{memories:{${mems.join(',')}}}`); }
  }
  if(!tagParts.length) return '';
  return `{${tagParts.join(',')}}`;
}

function mcId(id){
  const value = String(id || '');
  return value.includes(':') ? value : `minecraft:${value}`;
}

function isWearableEntity(id){
  const x = String(id||'').replace(/^minecraft:/,'');
  return [
    'zombie','husk','drowned','zombie_villager',
    'skeleton','stray','wither_skeleton',
    'piglin','zombified_piglin',
    'pillager','vindicator','evoker','illusioner'
  ].includes(x);
}

function buildCommandString(entry){
  const type = entry?.type || 'summon';
  const target = entry?.target || '@p';
  const coords = entry?.coords || '~ ~ ~';
  const dimension = entry?.dimension || 'overworld';
  if(type==='summon'){
    const entity = (entry.useCustomEntity && String(entry.customEntity||'').trim()) || entry.entity || 'zombie';
    const nbt = buildSummonNbt({
      entity,
      armor: entry.armor,
      scale: entry.scale,
      version: entry.version,
      customName: entry.customName,
      customNameColor: entry.customNameColor,
      customNameBold: entry.customNameBold,
      customNameItalic: entry.customNameItalic,
      customNameUnder: entry.customNameUnder,
      customNameStrike: entry.customNameStrike,
      customNameObf: entry.customNameObf,
      customNameVisible: entry.customNameVisible,
      glowing: entry.glowing,
      noAI: entry.noAI,
      fuseTicks: entry.fuseTicks,
      persistent: entry.persistent!==false, // default true
      wardenNoBurrow: !!entry.wardenKeepAggro,
      wardenDigCooldownTtl: entry.wardenDigCooldownTtl
    });
    // If target is provided, run as that target so ~ ~ ~ resolves to player position
    if(target){
      const inDim = (dimension && dimension!=='overworld') ? ` in ${dimension==='nether'?'minecraft:the_nether': (dimension==='end'?'minecraft:the_end':'minecraft:overworld')}` : '';
      return `execute as ${target}${inDim} at @s run summon ${mcId(entity)} ${coords}${nbt? ' '+nbt:''}`;
    }
    return `summon ${mcId(entity)} ${coords}${nbt? ' '+nbt:''}`;
  }
  if(type==='delay'){
    const ms = Math.max(0, parseInt(entry.ms)||0);
    return `delay ${ms}`;
  }
  if(type==='give'){
    const item = (entry.itemCustom && String(entry.itemCustom).trim()) || entry.item || 'diamond_sword';
    const count = Math.max(1, Math.min(64, parseInt(entry.count)||1));
    const displayName = entry.itemName && String(entry.itemName).trim();
    const lore = Array.isArray(entry.itemLore)? entry.itemLore.filter(Boolean).map(String) : [];
    // Encantamientos
    const ench = Array.isArray(entry.itemEnchants)? entry.itemEnchants.filter(e=> e && e.id).map(e=> ({ id: String(e.id), lvl: Math.max(1, Math.min(255, parseInt(e.lvl)||1)) })) : [];
    // Construir NBT: combinar display y Enchantments
    const dataParts = [];
    if(displayName || lore.length){
      const nameComp = displayName? `Name:'${jsonTextComponent({ text: displayName, color: entry.itemNameColor, bold: entry.itemNameBold, italic: entry.itemNameItalic, underlined: entry.itemNameUnder, strikethrough: entry.itemNameStrike, obfuscated: entry.itemNameObf, font: entry.itemNameFont })}'` : '';
      const loreComp = lore.length? `Lore:[${lore.map(s=> `'${jsonTextComponent({ text: s, color: entry.itemLoreColor, bold: entry.itemLoreBold, italic: entry.itemLoreItalic, underlined: entry.itemLoreUnder, strikethrough: entry.itemLoreStrike, obfuscated: entry.itemLoreObf, font: entry.itemLoreFont })}'`).join(',')}]` : '';
      const inner = [nameComp, loreComp].filter(Boolean).join(',');
      dataParts.push(`display:{${inner}}`);
    }
    if(ench.length){
      const entries = ench.map(e=> `{id:\"${mcId(e.id)}\",lvl:${e.lvl}s}`);
      dataParts.push(`Enchantments:[${entries.join(',')}]`);
    }
    const data = dataParts.length ? `{${dataParts.join(',')}}` : '';
    return data? `give ${target} ${mcId(item)}${data} ${count}` : `give ${target} ${mcId(item)} ${count}`;
  }
  if(type==='time'){
    const mode = entry.timeMode || 'preset';
    const preset = entry.timePreset || 'day'; // day|noon|night|midnight
    if(mode==='preset'){
      return `time set ${preset}`;
    } else if(mode==='custom'){
      const t = Math.max(0, Math.min(24000, parseInt(entry.timeTicks)||0));
      return `time set ${t}`;
    } else if(mode==='random'){
      // Se ajusta en runtime también; aquí emitimos un marcador válido
      return `time set 0`;
    }
  }
  if(type==='weather'){
    const mode = entry.weather || 'clear';
    const duration = Math.max(0, Math.min(1000000, parseInt(entry.weatherDuration)||0));
    return duration > 0 ? `weather ${mode} ${duration}` : `weather ${mode}`;
  }
  if(type==='gamerule'){
    const rule = (entry.gameruleCustom && String(entry.gameruleCustom).trim()) || entry.gamerule || 'keepInventory';
    let value = entry.gameruleValue;
    if(value == null || value === '') value = 'true';
    return `gamerule ${rule} ${String(value).trim()}`;
  }
  if(type==='gamemode'){
    const mode = entry.gamemode || 'survival';
    return `gamemode ${mode} ${target}`;
  }
  if(type==='difficulty'){
    const difficulty = entry.difficulty || 'normal';
    return `difficulty ${difficulty}`;
  }
  if(type==='experience' || type==='xp'){
    const mode = entry.xpMode || 'add';
    const amount = Math.max(0, Math.min(1000000, parseInt(entry.xpAmount)||1));
    const unit = entry.xpUnit === 'levels' ? 'levels' : 'points';
    return `experience ${mode} ${target} ${amount} ${unit}`;
  }
  if(type==='enchant'){
    const enchant = entry.enchant || 'minecraft:sharpness';
    const level = Math.max(1, Math.min(255, parseInt(entry.enchantLevel)||1));
    return `enchant ${target} ${mcId(enchant)} ${level}`;
  }
  if(type==='tp'){
    const mode = entry.tpMode || 'player';
    const dim = entry.tpDimension || 'overworld';
    if(mode==='coords'){
      const xyz = entry.tpCoords || '~ ~ ~';
      const inDim = (dim && dim!=='overworld') ? ` in ${dim==='nether'?'minecraft:the_nether': (dim==='end'?'minecraft:the_end':'minecraft:overworld')}` : '';
      return `execute${inDim? inDim:''} run tp ${target} ${xyz}`;
    } else {
      const dest = entry.tpTarget || '@p';
      const inDim = (dim && dim!=='overworld') ? ` in ${dim==='nether'?'minecraft:the_nether': (dim==='end'?'minecraft:the_end':'minecraft:overworld')}` : '';
      return `execute${inDim? inDim:''} run tp ${target} ${dest}`;
    }
  }
  if(type==='fill'){
    const from = entry.from || '~ ~ ~';
    const to = entry.to || '~ ~ ~';
    const block = (entry.blockCustom && String(entry.blockCustom).trim()) || entry.block || 'stone';
    const mode = entry.mode || 'replace';
    const base = `fill ${from} ${to} ${mcId(block)}${mode && mode!=='replace' ? ' '+mode : ''}`;
    return target ? `execute as ${target} at ${target} run ${base}` : base;
  }
  if(type==='setblock'){
    const pos = entry.pos || '~ ~ ~';
    const block = (entry.blockCustom && String(entry.blockCustom).trim()) || entry.block || 'stone';
    const mode = entry.mode || 'replace';
    const base = `setblock ${pos} ${mcId(block)} ${mode}`;
    return target ? `execute as ${target} at ${target} run ${base}` : base;
  }
  if(type==='say'){
    const text = entry.text!=null? String(entry.text) : (entry.raw||'Hola');
    return `say ${text}`;
  }
  if(type==='tellraw'){
    const target = entry?.target || '@a';
    const comp = jsonTextComponent({
      text: entry.tellText ?? '',
      color: entry.tellColor,
      bold: entry.tellBold,
      italic: entry.tellItalic,
      underlined: entry.tellUnder,
      strikethrough: entry.tellStrike,
      obfuscated: entry.tellObf
    });
    // tellraw expects raw JSON component (no extra quotes)
    return `tellraw ${target} ${comp}`;
  }
  if(type==='effect'){
    const mode = entry.effectMode || 'give';
    const eff = (entry.effectCustom && String(entry.effectCustom).trim()) || entry.effect || 'speed';
    if(mode==='clear'){
      return `effect clear ${target}` + (eff && eff!=='all'? ` ${mcId(eff)}`:'' );
    } else {
      const seconds = Math.max(1, Math.min(6000, parseInt(entry.seconds)||30));
      const amplifier = Math.max(0, Math.min(255, parseInt(entry.amplifier)||0));
      const hideParticles = !!entry.hideParticles;
      return `effect give ${target} ${mcId(eff)} ${seconds} ${amplifier} ${hideParticles?'true':'false'}`;
    }
  }
  if(type==='title'){
    const channel = entry.titleChannel || 'title';
    const comp = jsonTextComponent({ text: entry.text!=null? String(entry.text): 'Hola' });
    const withTimes = (entry.fadeIn!=null || entry.stay!=null || entry.fadeOut!=null);
    const fadeIn = Math.max(0, parseInt(entry.fadeIn)||10);
    const stay = Math.max(0, parseInt(entry.stay)||70);
    const fadeOut = Math.max(0, parseInt(entry.fadeOut)||20);
    const parts = [];
    if(withTimes) parts.push(`title ${target} times ${fadeIn} ${stay} ${fadeOut}`);
    // title expects raw JSON component (no extra quotes)
    parts.push(`title ${target} ${channel} ${comp}`);
    return parts.join('\n');
  }
  // fallback raw
  return (entry.raw && String(entry.raw).trim()) || '';
}

function stripGeneratedHints(cmd){
  return String(cmd || '').replace(/\s+#\s*(offset aleatorio|aleatorio)\s*$/i, '').trim();
}

function applyRuntimeRandoms(entry, command){
  let cmd = stripGeneratedHints(command);
  const type = entry?.type || 'summon';
  if(type === 'time' && entry?.timeMode === 'random'){
    const t = Math.floor(Math.random() * 24001);
    cmd = cmd.replace(/time\s+set\s+\d+/i, `time set ${t}`);
  }
  if(entry?.useRandomOffset && entry?.target){
    const pick = (min, max) => {
      const a = Number(min);
      const b = Number(max);
      if(!isFinite(a) || !isFinite(b)) return 0;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return Math.round((lo + Math.random() * (hi - lo)) * 10) / 10;
    };
    const dx = pick(entry.rxMin ?? -3, entry.rxMax ?? 3);
    const dy = pick(entry.ryMin ?? 0, entry.ryMax ?? 0);
    const dz = pick(entry.rzMin ?? -3, entry.rzMax ?? 3);
    const insert = ` positioned ~${dx} ~${dy} ~${dz} `;
    if(/ at @s\s+run /i.test(cmd)){
      cmd = cmd.replace(/ at @s\s+run /i, ` at @s${insert}run `);
    } else if(/^execute\s+/i.test(cmd) && / run /i.test(cmd)){
      cmd = cmd.replace(/ run /i, `${insert}run `);
    }
  }
  return cmd.trim();
}

function prepareCommandForExecution(entry, version){
  const next = { ...(entry || {}), version: version || entry?.version || '1.21' };
  const base = (next.type === 'raw' && next.raw) ? String(next.raw).replace(/^\//, '') : buildCommandString(next);
  return applyRuntimeRandoms(next, base);
}

// Exportar funciones globalmente para que estén disponibles inmediatamente
if(typeof window !== 'undefined') {
  if(!window.MinecraftCommandBuilder) window.MinecraftCommandBuilder = {};
  window.MinecraftCommandBuilder.buildCommandString = buildCommandString;
  window.MinecraftCommandBuilder.buildSummonNbt = buildSummonNbt;
  window.MinecraftCommandBuilder.jsonTextComponent = jsonTextComponent;
  window.MinecraftCommandBuilder.mcId = mcId;
  window.MinecraftCommandBuilder.prepareCommandForExecution = prepareCommandForExecution;
}

export default function MinecraftCommandBuilder({ params, onParam }){
  const [draft, setDraft] = useState(() => normalizeBuilderParams(params));
  const seedRef = React.useRef(params);
  useEffect(()=>{
    if(params === seedRef.current) return;
    seedRef.current = params;
    setDraft(normalizeBuilderParams(params));
  }, [params]);

  const p = draft || {};
  const commit = (next, changes)=>{
    setDraft(next);
    try { (changes || []).forEach(([k, v]) => onParam?.(k, v)); }
    catch(e) { console.error('[MCBuilder] persist error:', e); }
  };
  const commands = Array.isArray(p.commands)? p.commands : [];

  const version = p.version || '1.21';
  const assetsBaseEntities = '/assets/minecraft/entities/';
  const assetsBaseItems = '/assets/minecraft/items/';
  const allEntities = entitiesCatalog || [];
  const allItems = itemsCatalog || [];

  const addCommand = ()=>{
    const base = { type:'summon', entity:'zombie', armor:'none', times:1, delayMs:0, coords:'~ ~ ~', target:'{player}', version };
    const withCmd = withBuiltCommand(base, version);
    const next = [...commands, withCmd];
    commit({ ...p, commands: next }, [['commands', next]]);
  };
  // migrate legacy 'delay' entries into per-entry delayMs and drop them
  const [migrated, setMigrated] = useState(false);
  useEffect(()=>{
    if (migrated) return;
    if (!Array.isArray(commands) || commands.length===0) { setMigrated(true); return; }
    let changed = false;
    const next = [];
    for(const c of commands){
      if ((c?.type||'') === 'delay'){
        const ms = Math.max(0, parseInt(c.ms)||0);
        if(next.length>0){
          const prev = next[next.length-1];
          prev.delayMs = Math.max(0, (prev.delayMs||0) + ms);
          prev.command = buildCommandString({ ...prev, version });
        }
        changed = true;
      } else {
        const merged = { ...c };
        if(merged.delayMs==null) merged.delayMs = 0;
        merged.command = buildCommandString({ ...merged, version });
        next.push(merged);
      }
    }
    if (changed) {
      const normalized = next.map(c => withBuiltCommand(c, version));
      commit({ ...p, commands: normalized }, [['commands', normalized]]);
    }
    setMigrated(true);
  }, [commands, migrated, version]);
  const update = (i, patch)=>{
    const next = commands.map((c,idx)=> {
      if(idx!==i) return c;
      const merged = { ...c, ...patch };
      // Keep version in entry for command building
      const entryForBuild = { ...merged, version };
      return { ...merged, command: buildCommandString(entryForBuild) };
    });
    commit({ ...p, commands: next }, [['commands', next]]);
  };
  const remove = (i)=>{ const next = commands.filter((_,idx)=> idx!==i); commit({ ...p, commands: next }, [['commands', next]]); };
  const move = (i,dir)=>{
    const j = i+dir; if(j<0 || j>=commands.length) return;
    const next = [...commands]; const [m]=next.splice(i,1); next.splice(j,0,m); commit({ ...p, commands: next }, [['commands', next]]);
  };

  const canScale = useMemo(()=>{
    try { const v=version.split('.').map(n=>parseInt(n)||0); return (v[0]>1) || (v[0]===1 && v[1]>=21); } catch { return false; }
  },[version]);

  // Keep version in params for executor context if needed later
  const onVersion = (v)=>{
    const nextCommands = commands.map(c => withBuiltCommand(c, v));
    commit({ ...p, version: v, commands: nextCommands }, [['version', v], ['commands', nextCommands]]);
  };

  // Boot: if opened with no commands, create a default "Comando 1" for 1.21 so the panel has a stable height
  const [bootInited, setBootInited] = useState(false);
  useEffect(()=>{
    if(bootInited) return;
    if(Array.isArray(commands) && commands.length>0){ setBootInited(true); return; }
    const base = { type:'summon', entity:'zombie', armor:'none', times:1, delayMs:0, coords:'~ ~ ~', target:'{player}' };
    const nextCommands = [withBuiltCommand(base, version || '1.21')];
    commit({ ...p, version: version || '1.21', commands: nextCommands }, [['version', version || '1.21'], ['commands', nextCommands]]);
    setBootInited(true);
  }, [bootInited, commands, version]);

  return (
    <div>
      <div>
        <div>
          <label>Versión de Minecraft</label>
          <select value={version} onChange={e=> onVersion(e.target.value)}>
            <option value="1.21">1.21</option>
            <option value="1.20">1.20</option>
            <option value="1.19">1.19</option>
            <option value="1.18">1.18</option>
          </select>
        </div>
        <div>
          <button type="button" onClick={addCommand}>+ Añadir otro comando</button>
        </div>
      </div>

      {commands.length===0 && (
        <div>Sin comandos. Usa "+ Añadir otro comando".</div>
      )}

      <div>
  {commands.map((c,i)=>{
          const type = c.type || 'summon';
          const preview = buildCommandString({ ...c, version });
          const usesTarget = !TARGETLESS_TYPES.has(type);
          return (
            <div key={c._builderId || i}>
              <div>
                <div>Comando {i+1}</div>
                <div>
                  <button type="button" onClick={()=>move(i,-1)} disabled={i===0}>↑</button>
                  <button type="button" onClick={()=>move(i,1)} disabled={i===commands.length-1}>↓</button>
                  <button type="button" onClick={()=>remove(i)}>🗑</button>
                </div>
              </div>
              <div>
                <div>
                  <label>Tipo</label>
                  <select value={type} onChange={e=> update(i, { type: e.target.value })}>
                    <option value="summon">/summon</option>
                    <option value="give">/give</option>
                    <option value="tp">/tp</option>
                    <option value="time">/time</option>
                    <option value="say">/say</option>
                    <option value="tellraw">/tellraw (texto con estilo)</option>
                    <option value="effect">/effect</option>
                    <option value="title">/title</option>
                    <option value="gamerule">/gamerule</option>
                    <option value="weather">/weather</option>
                    <option value="gamemode">/gamemode</option>
                    <option value="difficulty">/difficulty</option>
                    <option value="experience">/experience</option>
                    <option value="enchant">/enchant</option>
                    <option value="fill">/fill</option>
                    <option value="setblock">/setblock</option>
                    <option value="raw">Raw</option>
                  </select>
                </div>

                {usesTarget && <div>
                  <label>Target</label>
                  <div>
                    <input value={c.target||''} onChange={e=> update(i,{ target: e.target.value })} placeholder="{player}, @a, @r, @p" />
                    <select value={c.target||''} onChange={e=> update(i,{ target: e.target.value })}>
                      <option value="">—</option>
                      <option value="{player}">Jugador</option>
                      <option value="@a">@a</option>
                      <option value="@p">@p</option>
                      <option value="@r">@r</option>
                      <option value="@s">@s</option>
                    </select>
                  </div>
                  {c.target==='{player}' && (
                    <div>Usará el Jugador configurado en ServerTap</div>
                  )}
                </div>}
                <div>
                  <label>Veces</label>
                  <input type="number" min={1} max={100} value={c.times||1} onChange={e=> update(i,{ times: Math.max(1, Math.min(100, parseInt(e.target.value)||1)) })} />
                </div>
              </div>

              {type==='tellraw' && (
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-3">
                  <div className="flex flex-col gap-1 md:col-span-3">
                    <label className="opacity-70">Texto</label>
                    <input value={c.tellText||''} onChange={e=> update(i,{ tellText: e.target.value })} placeholder="Mensaje estilizado" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Color</label>
                    <select value={c.tellColor||''} onChange={e=> update(i,{ tellColor: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="">(por defecto)</option>
                      <option value="black">black</option>
                      <option value="dark_blue">dark_blue</option>
                      <option value="dark_green">dark_green</option>
                      <option value="dark_aqua">dark_aqua</option>
                      <option value="dark_red">dark_red</option>
                      <option value="dark_purple">dark_purple</option>
                      <option value="gold">gold</option>
                      <option value="gray">gray</option>
                      <option value="dark_gray">dark_gray</option>
                      <option value="blue">blue</option>
                      <option value="green">green</option>
                      <option value="aqua">aqua</option>
                      <option value="red">red</option>
                      <option value="light_purple">light_purple</option>
                      <option value="yellow">yellow</option>
                      <option value="white">white</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <input id={`bold-${i}`} type="checkbox" checked={!!c.tellBold} onChange={e=> update(i,{ tellBold: e.target.checked })} />
                    <label htmlFor={`bold-${i}`} className="opacity-70">Negrita</label>
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <input id={`italic-${i}`} type="checkbox" checked={!!c.tellItalic} onChange={e=> update(i,{ tellItalic: e.target.checked })} />
                    <label htmlFor={`italic-${i}`} className="opacity-70">Cursiva</label>
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <input id={`under-${i}`} type="checkbox" checked={!!c.tellUnder} onChange={e=> update(i,{ tellUnder: e.target.checked })} />
                    <label htmlFor={`under-${i}`} className="opacity-70">Subrayado</label>
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <input id={`strike-${i}`} type="checkbox" checked={!!c.tellStrike} onChange={e=> update(i,{ tellStrike: e.target.checked })} />
                    <label htmlFor={`strike-${i}`} className="opacity-70">Tachado</label>
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <input id={`obf-${i}`} type="checkbox" checked={!!c.tellObf} onChange={e=> update(i,{ tellObf: e.target.checked })} />
                    <label htmlFor={`obf-${i}`} className="opacity-70">Obfuscado</label>
                  </div>
                </div>
              )}

              {/* Options by type */}
              {type==='summon' && (
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Entidad</label>
                    <div className="flex gap-2">
                      {!c.useCustomEntity && (
                        <>
                          <select value={c.entity||'zombie'} onChange={e=> update(i,{ entity: e.target.value })} className="flex-1 bg-white/10 rounded px-2 py-1 text-xs">
                            {allEntities.map(e=> (
                              <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                          </select>
                          {(() => { const ent = allEntities.find(en=>en.id===c.entity); const img = ent? (assetsBaseEntities + (ent.png||`${ent.id}.png`)) : null; return img? <img src={img} alt={ent?.name} className="w-8 h-8 object-contain"/> : null; })()}
                        </>
                      )}
                      {c.useCustomEntity && (
                        <input value={c.customEntity||''} onChange={e=> update(i,{ customEntity: e.target.value })} placeholder="mod:custom_entity" className="flex-1 bg-white/10 rounded px-2 py-1 text-xs" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <input id={`cust-${i}`} type="checkbox" checked={!!c.useCustomEntity} onChange={e=> update(i,{ useCustomEntity: e.target.checked })} />
                    <label htmlFor={`cust-${i}`} className="opacity-70">Entidad personalizada (mod/datapack)</label>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Coordenadas</label>
                    <input value={c.coords||'~ ~ ~'} onChange={e=> update(i,{ coords: e.target.value })} placeholder="~ ~ ~" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  {isWearableEntity((c.useCustomEntity? c.customEntity : c.entity) || '') && (
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Armadura</label>
                      <select value={c.armor||'none'} onChange={e=> update(i,{ armor: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                        {ARMORS.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  )}
                  {((c.useCustomEntity? c.customEntity : c.entity) !== 'tnt' && (c.useCustomEntity? c.customEntity : c.entity) !== 'minecraft:tnt') && (
                    <div className="flex items-center gap-2 mt-5">
                      <input id={`persist-${i}`} type="checkbox" checked={c.persistent!==false} onChange={e=> update(i,{ persistent: e.target.checked })} />
                      <label htmlFor={`persist-${i}`} className="opacity-70">Persistente (no desaparece)</label>
                    </div>
                  )}
                  {canScale && !(c.entity==='tnt'||c.entity==='minecraft:tnt') && (
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Scale (1.21+)</label>
                      <input type="number" step="0.1" min={0.1} max={10} value={c.scale??''} onChange={e=> update(i,{ scale: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-5">
                    <input id={`glow-${i}`} type="checkbox" checked={!!c.glowing} onChange={e=> update(i,{ glowing: e.target.checked })} />
                    <label htmlFor={`glow-${i}`} className="opacity-70">Glow</label>
                  </div>
                  {((c.useCustomEntity? c.customEntity : c.entity) !== 'tnt' && (c.useCustomEntity? c.customEntity : c.entity) !== 'minecraft:tnt') && (
                    <div className="flex items-center gap-2 mt-5">
                      <input id={`noai-${i}`} type="checkbox" checked={!!c.noAI} onChange={e=> update(i,{ noAI: e.target.checked })} />
                      <label htmlFor={`noai-${i}`} className="opacity-70">NoAI (no se mueve)</label>
                    </div>
                  )}
                  {(((c.useCustomEntity? c.customEntity : c.entity)==='warden')||((c.useCustomEntity? c.customEntity : c.entity)==='minecraft:warden')) && (
                    <div className="flex items-center gap-3 mt-5 md:col-span-2">
                      <div className="flex items-center gap-2">
                        <input id={`wag-${i}`} type="checkbox" checked={!!c.wardenKeepAggro} onChange={e=> update(i,{ wardenKeepAggro: e.target.checked })} />
                        <label htmlFor={`wag-${i}`} className="opacity-70">Warden: no esconderse (Brain)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="opacity-70">dig_cooldown TTL</label>
                        <input type="number" min={1} value={c.wardenDigCooldownTtl??1200} onChange={e=> update(i,{ wardenDigCooldownTtl: Math.max(1, parseInt(e.target.value)||1200) })} className="w-28 bg-white/10 rounded px-2 py-1 text-xs" />
                        <span className="text-[10px] opacity-60">en ticks (L)</span>
                      </div>
                    </div>
                  )}
                  {(((c.useCustomEntity? c.customEntity : c.entity)==='tnt')||((c.useCustomEntity? c.customEntity : c.entity)==='minecraft:tnt')) && (
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Fusible (ticks)</label>
                      <input type="number" min={0} max={6000} value={c.fuseTicks??80} onChange={e=> update(i,{ fuseTicks: Math.max(0, Math.min(6000, parseInt(e.target.value)||0)) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                      <div className="text-[10px] opacity-60">20 ticks = 1 segundo. TNT no permite cambiar el radio de explosión en vanilla.</div>
                    </div>
                  )}
                  <div className="md:col-span-6">
                    <div className="flex items-center gap-2 mt-2">
                      <input id={`randpos-${i}`} type="checkbox" checked={!!c.useRandomOffset} onChange={e=> update(i,{ useRandomOffset: e.target.checked })} />
                      <label htmlFor={`randpos-${i}`} className="opacity-70">Offset aleatorio relativo al jugador</label>
                    </div>
                    {c.useRandomOffset && (
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-2">
                        <div className="flex flex-col gap-1">
                          <label className="opacity-70">X min</label>
                          <input type="number" value={c.rxMin??-3} onChange={e=> update(i,{ rxMin: parseFloat(e.target.value) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="opacity-70">X max</label>
                          <input type="number" value={c.rxMax??3} onChange={e=> update(i,{ rxMax: parseFloat(e.target.value) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="opacity-70">Y min</label>
                          <input type="number" value={c.ryMin??0} onChange={e=> update(i,{ ryMin: parseFloat(e.target.value) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="opacity-70">Y max</label>
                          <input type="number" value={c.ryMax??0} onChange={e=> update(i,{ ryMax: parseFloat(e.target.value) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="opacity-70">Z min</label>
                          <input type="number" value={c.rzMin??-3} onChange={e=> update(i,{ rzMin: parseFloat(e.target.value) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="opacity-70">Z max</label>
                          <input type="number" value={c.rzMax??3} onChange={e=> update(i,{ rzMax: parseFloat(e.target.value) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-6 grid grid-cols-1 md:grid-cols-6 gap-3 mt-2">
                    <div className="flex flex-col gap-1 md:col-span-2">
                      <label className="opacity-70">Custom Name</label>
                      <input value={c.customName||''} onChange={e=> update(i,{ customName: e.target.value })} placeholder="Nombre visible de la entidad" className="bg-white/10 rounded px-2 py-1 text-xs" />
                      <PlaceholderChips onPick={token => update(i,{ customName: appendPlaceholder(c.customName, token) })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Color</label>
                      <select value={c.customNameColor||''} onChange={e=> update(i,{ customNameColor: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                        <option value="">(defecto)</option>
                        <option value="black">black</option>
                        <option value="dark_blue">dark_blue</option>
                        <option value="dark_green">dark_green</option>
                        <option value="dark_aqua">dark_aqua</option>
                        <option value="dark_red">dark_red</option>
                        <option value="dark_purple">dark_purple</option>
                        <option value="gold">gold</option>
                        <option value="gray">gray</option>
                        <option value="dark_gray">dark_gray</option>
                        <option value="blue">blue</option>
                        <option value="green">green</option>
                        <option value="aqua">aqua</option>
                        <option value="red">red</option>
                        <option value="light_purple">light_purple</option>
                        <option value="yellow">yellow</option>
                        <option value="white">white</option>
                      </select>
                    </div>
                    {(((c.useCustomEntity? c.customEntity : c.entity)!=='tnt')&&((c.useCustomEntity? c.customEntity : c.entity)!=='minecraft:tnt')) && (
                      <>
                        <div className="flex items-center gap-2 mt-5">
                          <input id={`cnb-${i}`} type="checkbox" checked={!!c.customNameBold} onChange={e=> update(i,{ customNameBold: e.target.checked })} />
                          <label htmlFor={`cnb-${i}`} className="opacity-70">Negrita</label>
                        </div>
                        <div className="flex items-center gap-2 mt-5">
                          <input id={`cni-${i}`} type="checkbox" checked={!!c.customNameItalic} onChange={e=> update(i,{ customNameItalic: e.target.checked })} />
                          <label htmlFor={`cni-${i}`} className="opacity-70">Cursiva</label>
                        </div>
                        <div className="flex items-center gap-2 mt-5">
                          <input id={`cnu-${i}`} type="checkbox" checked={!!c.customNameUnder} onChange={e=> update(i,{ customNameUnder: e.target.checked })} />
                          <label htmlFor={`cnu-${i}`} className="opacity-70">Subrayado</label>
                        </div>
                        <div className="flex items-center gap-2 mt-5">
                          <input id={`cns-${i}`} type="checkbox" checked={!!c.customNameStrike} onChange={e=> update(i,{ customNameStrike: e.target.checked })} />
                          <label htmlFor={`cns-${i}`} className="opacity-70">Tachado</label>
                        </div>
                        <div className="flex items-center gap-2 mt-5">
                          <input id={`cno-${i}`} type="checkbox" checked={!!c.customNameObf} onChange={e=> update(i,{ customNameObf: e.target.checked })} />
                          <label htmlFor={`cno-${i}`} className="opacity-70">Obfuscado</label>
                        </div>
                        <div className="flex items-center gap-2 mt-5">
                          <input id={`cnv-${i}`} type="checkbox" checked={!!c.customNameVisible} onChange={e=> update(i,{ customNameVisible: e.target.checked })} />
                          <label htmlFor={`cnv-${i}`} className="opacity-70">Mostrar nombre</label>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {type==='give' && (
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Item</label>
                    <div className="flex gap-2">
                      <select value={c.item||'diamond_sword'} onChange={e=> update(i,{ item: e.target.value })} className="flex-1 bg-white/10 rounded px-2 py-1 text-xs">
                        {allItems.map(it=> (
                          <option key={it.id} value={it.id}>{it.name}</option>
                        ))}
                      </select>
                      <input value={c.itemCustom||''} onChange={e=> update(i,{ itemCustom: e.target.value })} placeholder="minecraft:custom_item" className="w-44 bg-white/10 rounded px-2 py-1 text-xs" />
                      {(() => { const pickId = (c.itemCustom && c.itemCustom.trim()) || c.item; const it = allItems.find(en=>en.id===pickId); const img = it? (assetsBaseItems + (it.png||`${it.id}.png`)) : null; return img? <img src={img} alt={it?.name} className="w-8 h-8 object-contain"/> : null; })()}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Cantidad</label>
                    <input type="number" min={1} max={64} value={c.count||1} onChange={e=> update(i,{ count: Math.max(1, Math.min(64, parseInt(e.target.value)||1)) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Nombre del item (display)</label>
                    <input value={c.itemName||''} onChange={e=> update(i,{ itemName: e.target.value })} placeholder="Nombre bonito" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-3">
                    <label className="opacity-70">Lore (una línea por entrada)</label>
                    <textarea value={(Array.isArray(c.itemLore)? c.itemLore.join('\n') : (c.itemLore||''))} onChange={e=> update(i,{ itemLore: String(e.target.value||'').split('\n') })} placeholder={"Primera linea\nSegunda linea"} rows={2} className="bg-white/10 rounded px-2 py-1 text-xs font-mono" />
                  </div>
                  {/* Estilo del Nombre (display) */}
                  <div className="md:col-span-6 grid grid-cols-1 md:grid-cols-6 gap-3 mt-2">
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Nombre Color</label>
                      <select value={c.itemNameColor||''} onChange={e=> update(i,{ itemNameColor: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                        <option value="">(defecto)</option>
                        {['black','dark_blue','dark_green','dark_aqua','dark_red','dark_purple','gold','gray','dark_gray','blue','green','aqua','red','light_purple','yellow','white'].map(col=> <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 mt-5"><input id={`inameb-${i}`} type="checkbox" checked={!!c.itemNameBold} onChange={e=> update(i,{ itemNameBold: e.target.checked })} /><label htmlFor={`inameb-${i}`} className="opacity-70">Negrita</label></div>
                    <div className="flex items-center gap-2 mt-5"><input id={`inamei-${i}`} type="checkbox" checked={!!c.itemNameItalic} onChange={e=> update(i,{ itemNameItalic: e.target.checked })} /><label htmlFor={`inamei-${i}`} className="opacity-70">Cursiva</label></div>
                    <div className="flex items-center gap-2 mt-5"><input id={`inameu-${i}`} type="checkbox" checked={!!c.itemNameUnder} onChange={e=> update(i,{ itemNameUnder: e.target.checked })} /><label htmlFor={`inameu-${i}`} className="opacity-70">Subrayado</label></div>
                    <div className="flex items-center gap-2 mt-5"><input id={`inames-${i}`} type="checkbox" checked={!!c.itemNameStrike} onChange={e=> update(i,{ itemNameStrike: e.target.checked })} /><label htmlFor={`inames-${i}`} className="opacity-70">Tachado</label></div>
                    <div className="flex items-center gap-2 mt-5"><input id={`inameo-${i}`} type="checkbox" checked={!!c.itemNameObf} onChange={e=> update(i,{ itemNameObf: e.target.checked })} /><label htmlFor={`inameo-${i}`} className="opacity-70">Obfuscado</label></div>
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Nombre Font</label>
                      <input value={c.itemNameFont||''} onChange={e=> update(i,{ itemNameFont: e.target.value })} placeholder="minecraft:default" className="bg-white/10 rounded px-2 py-1 text-xs" />
                    </div>
                  </div>
                  {/* Estilo del Lore (aplica a todas las líneas) */}
                  <div className="md:col-span-6 grid grid-cols-1 md:grid-cols-6 gap-3 mt-2">
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Lore Color</label>
                      <select value={c.itemLoreColor||''} onChange={e=> update(i,{ itemLoreColor: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                        <option value="">(defecto)</option>
                        {['black','dark_blue','dark_green','dark_aqua','dark_red','dark_purple','gold','gray','dark_gray','blue','green','aqua','red','light_purple','yellow','white'].map(col=> <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 mt-5"><input id={`iloreb-${i}`} type="checkbox" checked={!!c.itemLoreBold} onChange={e=> update(i,{ itemLoreBold: e.target.checked })} /><label htmlFor={`iloreb-${i}`} className="opacity-70">Negrita</label></div>
                    <div className="flex items-center gap-2 mt-5"><input id={`ilorei-${i}`} type="checkbox" checked={!!c.itemLoreItalic} onChange={e=> update(i,{ itemLoreItalic: e.target.checked })} /><label htmlFor={`ilorei-${i}`} className="opacity-70">Cursiva</label></div>
                    <div className="flex items-center gap-2 mt-5"><input id={`iloreu-${i}`} type="checkbox" checked={!!c.itemLoreUnder} onChange={e=> update(i,{ itemLoreUnder: e.target.checked })} /><label htmlFor={`iloreu-${i}`} className="opacity-70">Subrayado</label></div>
                    <div className="flex items-center gap-2 mt-5"><input id={`ilores-${i}`} type="checkbox" checked={!!c.itemLoreStrike} onChange={e=> update(i,{ itemLoreStrike: e.target.checked })} /><label htmlFor={`ilores-${i}`} className="opacity-70">Tachado</label></div>
                    <div className="flex items-center gap-2 mt-5"><input id={`iloreo-${i}`} type="checkbox" checked={!!c.itemLoreObf} onChange={e=> update(i,{ itemLoreObf: e.target.checked })} /><label htmlFor={`iloreo-${i}`} className="opacity-70">Obfuscado</label></div>
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Lore Font</label>
                      <input value={c.itemLoreFont||''} onChange={e=> update(i,{ itemLoreFont: e.target.value })} placeholder="minecraft:default" className="bg-white/10 rounded px-2 py-1 text-xs" />
                    </div>
                  </div>
                  {/* Encantamientos */}
                  <div className="md:col-span-6 mt-2 p-2 rounded border border-white/10 bg-black/20">
                    <div className="flex items-center justify-between mb-2">
                      <label className="opacity-70">Encantamientos</label>
                      <button type="button" onClick={()=>{
                        const list = Array.isArray(c.itemEnchants)? [...c.itemEnchants] : [];
                        list.push({ id:'sharpness', lvl:1 });
                        update(i,{ itemEnchants: list });
                      }} className="px-2 py-0.5 rounded bg-white/10 text-xs">+ Añadir</button>
                    </div>
                    {(Array.isArray(c.itemEnchants) && c.itemEnchants.length>0) ? (
                      <div className="space-y-2">
                        {c.itemEnchants.map((en,idx)=> (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                            <div className="flex flex-col gap-1 md:col-span-3">
                              <label className="opacity-70">Encantamiento</label>
                              <select value={en.id||''} onChange={e=>{
                                const list=[...c.itemEnchants]; list[idx]={ ...list[idx], id: e.target.value }; update(i,{ itemEnchants: list });
                              }} className="bg-white/10 rounded px-2 py-1 text-xs">
                                {ENCHANTMENTS.map(eid=> <option key={eid} value={eid}>{eid}</option>)}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="opacity-70">Nivel</label>
                              <input type="number" min={1} max={255} value={en.lvl??1} onChange={e=>{
                                const list=[...c.itemEnchants]; list[idx]={ ...list[idx], lvl: Math.max(1, Math.min(255, parseInt(e.target.value)||1)) }; update(i,{ itemEnchants: list });
                              }} className="bg-white/10 rounded px-2 py-1 text-xs" />
                            </div>
                            <div className="flex items-end">
                              <button type="button" onClick={()=>{
                                const list=[...c.itemEnchants]; list.splice(idx,1); update(i,{ itemEnchants: list });
                              }} className="px-2 py-0.5 rounded bg-rose-500/30 text-xs">Eliminar</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] opacity-60">Sin encantamientos añadidos.</div>
                    )}
                  </div>
                </div>
              )}

              {type==='tp' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Modo destino</label>
                    <select value={c.tpMode||'player'} onChange={e=> update(i,{ tpMode: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="player">Jugador/selector</option>
                      <option value="coords">Coordenadas</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Dimensión</label>
                    <select value={c.tpDimension||'overworld'} onChange={e=> update(i,{ tpDimension: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="overworld">Overworld</option>
                      <option value="nether">Nether</option>
                      <option value="end">End</option>
                    </select>
                  </div>
                  {c.tpMode==='coords' ? (
                    <div className="flex flex-col gap-1 md:col-span-2">
                      <label className="opacity-70">XYZ</label>
                      <input value={c.tpCoords||'~ ~ ~'} onChange={e=> update(i,{ tpCoords: e.target.value })} placeholder="~ ~ ~" className="bg-white/10 rounded px-2 py-1 text-xs" />
                      <div className="flex items-center gap-2 mt-2">
                        <input id={`tprand-${i}`} type="checkbox" checked={!!c.tpRandom} onChange={e=> update(i,{ tpRandom: e.target.checked })} />
                        <label htmlFor={`tprand-${i}`} className="opacity-70">Coordenadas aleatorias</label>
                      </div>
                      {c.tpRandom && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <input type="number" placeholder="X min" value={c.tpRxMin??-1000} onChange={e=> update(i,{ tpRxMin: parseInt(e.target.value)||0 })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                          <input type="number" placeholder="X max" value={c.tpRxMax??1000} onChange={e=> update(i,{ tpRxMax: parseInt(e.target.value)||0 })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                          <input type="number" placeholder="Y" value={c.tpRY??64} onChange={e=> update(i,{ tpRY: parseInt(e.target.value)||64 })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                          <input type="number" placeholder="Z min" value={c.tpRzMin??-1000} onChange={e=> update(i,{ tpRzMin: parseInt(e.target.value)||0 })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                          <input type="number" placeholder="Z max" value={c.tpRzMax??1000} onChange={e=> update(i,{ tpRzMax: parseInt(e.target.value)||0 })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                          <div className="text-[10px] opacity-60">Y fijo; X/Z aleatorios</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 md:col-span-2">
                      <label className="opacity-70">Destino</label>
                      <div className="flex gap-2">
                        <input value={c.tpTarget||'@p'} onChange={e=> update(i,{ tpTarget: e.target.value })} placeholder="@a, @r, @p o nombre" className="flex-1 bg-white/10 rounded px-2 py-1 text-xs" />
                        <select value={c.tpTarget||'@p'} onChange={e=> update(i,{ tpTarget: e.target.value })} className="w-24 bg-white/10 rounded px-2 py-1 text-xs">
                          <option value="@a">@a</option>
                          <option value="@p">@p</option>
                          <option value="@r">@r</option>
                          <option value="@s">@s</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {type==='raw' && (
                <div className="mt-3 flex flex-col gap-1">
                  <label className="opacity-70">Bloque de comandos Raw</label>
                  <textarea value={c.raw||''} onChange={e=> update(i,{ raw: e.target.value })} placeholder={`summon zombie ~ ~ ~\ndelay 1000\ngive @r minecraft:apple 1`} rows={4} className="bg-white/10 rounded px-2 py-1 text-xs font-mono" />
                  <div className="text-[10px] opacity-60">Puedes poner varios comandos, uno por línea. Usa "delay 1000" para pausar 1s entre líneas.</div>
                </div>
              )}

              {type==='say' && (
                <div className="mt-3 flex flex-col gap-1">
                  <label className="opacity-70">Texto</label>
                  <input value={c.text||''} onChange={e=> update(i,{ text: e.target.value })} placeholder="Hola a todos" className="bg-white/10 rounded px-2 py-1 text-xs" />
                </div>
              )}

              {type==='effect' && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Modo</label>
                    <select value={c.effectMode||'give'} onChange={e=> update(i,{ effectMode: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="give">Dar</option>
                      <option value="clear">Quitar</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Efecto</label>
                    <select value={c.effect||'speed'} onChange={e=> update(i,{ effect: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      {EFFECTS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <input value={c.effectCustom||''} onChange={e=> update(i,{ effectCustom: e.target.value })} placeholder="mod:custom_effect" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  {c.effectMode!=='clear' && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="opacity-70">Segundos</label>
                        <input type="number" min={1} max={6000} value={c.seconds||30} onChange={e=> update(i,{ seconds: Math.max(1, Math.min(6000, parseInt(e.target.value)||30)) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="opacity-70">Amplificador</label>
                        <input type="number" min={0} max={255} value={c.amplifier||0} onChange={e=> update(i,{ amplifier: Math.max(0, Math.min(255, parseInt(e.target.value)||0)) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                      </div>
                      <div className="flex items-center gap-2 mt-5">
                        <input id={`hideParticles-${i}`} type="checkbox" checked={!!c.hideParticles} onChange={e=> update(i,{ hideParticles: e.target.checked })} />
                        <label htmlFor={`hideParticles-${i}`} className="opacity-70">Ocultar partículas</label>
                      </div>
                    </>
                  )}
                </div>
              )}

              {type==='fill' && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Desde (x y z)</label>
                    <input value={c.from||'~ ~ ~'} onChange={e=> update(i,{ from: e.target.value })} placeholder="~ ~ ~" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Hasta (x y z)</label>
                    <input value={c.to||'~ ~ ~'} onChange={e=> update(i,{ to: e.target.value })} placeholder="~ ~ ~" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Bloque</label>
                    <div className="flex gap-2">
                      <select value={c.block||'stone'} onChange={e=> update(i,{ block: e.target.value })} className="flex-1 bg-white/10 rounded px-2 py-1 text-xs">
                        {allItems.map(it=> (
                          <option key={it.id} value={it.id}>{it.name||it.id}</option>
                        ))}
                      </select>
                      <input value={c.blockCustom||''} onChange={e=> update(i,{ blockCustom: e.target.value })} placeholder="minecraft:block_id" className="w-44 bg-white/10 rounded px-2 py-1 text-xs" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Modo</label>
                    <select value={c.mode||'replace'} onChange={e=> update(i,{ mode: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="replace">replace</option>
                      <option value="destroy">destroy</option>
                      <option value="hollow">hollow</option>
                      <option value="keep">keep</option>
                      <option value="outline">outline</option>
                    </select>
                  </div>
                </div>
              )}

              {type==='setblock' && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Posición (x y z)</label>
                    <input value={c.pos||'~ ~ ~'} onChange={e=> update(i,{ pos: e.target.value })} placeholder="~ ~ ~" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Bloque</label>
                    <div className="flex gap-2">
                      <select value={c.block||'stone'} onChange={e=> update(i,{ block: e.target.value })} className="flex-1 bg-white/10 rounded px-2 py-1 text-xs">
                        {allItems.map(it=> (
                          <option key={it.id} value={it.id}>{it.name||it.id}</option>
                        ))}
                      </select>
                      <input value={c.blockCustom||''} onChange={e=> update(i,{ blockCustom: e.target.value })} placeholder="minecraft:block_id" className="w-44 bg-white/10 rounded px-2 py-1 text-xs" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Modo</label>
                    <select value={c.mode||'replace'} onChange={e=> update(i,{ mode: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="replace">replace</option>
                      <option value="destroy">destroy</option>
                      <option value="keep">keep</option>
                    </select>
                  </div>
                </div>
              )}

              {type==='title' && (
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Canal</label>
                    <select value={c.titleChannel||'title'} onChange={e=> update(i,{ titleChannel: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="title">title</option>
                      <option value="subtitle">subtitle</option>
                      <option value="actionbar">actionbar</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-3">
                    <label className="opacity-70">Texto</label>
                    <input value={c.text||''} onChange={e=> update(i,{ text: e.target.value })} placeholder="Bienvenido!" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">FadeIn</label>
                    <input type="number" min={0} value={c.fadeIn??10} onChange={e=> update(i,{ fadeIn: Math.max(0, parseInt(e.target.value)||10) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Stay</label>
                    <input type="number" min={0} value={c.stay??70} onChange={e=> update(i,{ stay: Math.max(0, parseInt(e.target.value)||70) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">FadeOut</label>
                    <input type="number" min={0} value={c.fadeOut??20} onChange={e=> update(i,{ fadeOut: Math.max(0, parseInt(e.target.value)||20) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                </div>
              )}

              {type==='time' && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Modo</label>
                    <select value={c.timeMode||'preset'} onChange={e=> update(i,{ timeMode: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="preset">Predefinido</option>
                      <option value="custom">Ticks</option>
                      <option value="random">Aleatorio</option>
                    </select>
                  </div>
                  {(!c.timeMode || c.timeMode==='preset') && (
                    <div className="flex flex-col gap-1 md:col-span-2">
                      <label className="opacity-70">Predefinido</label>
                      <select value={c.timePreset||'day'} onChange={e=> update(i,{ timePreset: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                        <option value="day">day</option>
                        <option value="noon">noon</option>
                        <option value="night">night</option>
                        <option value="midnight">midnight</option>
                      </select>
                    </div>
                  )}
                  {(c.timeMode==='custom') && (
                    <div className="flex flex-col gap-1">
                      <label className="opacity-70">Ticks (0-24000)</label>
                      <input type="number" min={0} max={24000} value={c.timeTicks??0} onChange={e=> update(i,{ timeTicks: Math.max(0, Math.min(24000, parseInt(e.target.value)||0)) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                    </div>
                  )}
                </div>
              )}

              {type==='weather' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Clima</label>
                    <select value={c.weather||'clear'} onChange={e=> update(i,{ weather: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="clear">clear</option>
                      <option value="rain">rain</option>
                      <option value="thunder">thunder</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Duracion (segundos)</label>
                    <input type="number" min={0} max={1000000} value={c.weatherDuration??0} onChange={e=> update(i,{ weatherDuration: Math.max(0, Math.min(1000000, parseInt(e.target.value)||0)) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                </div>
              )}

              {type==='gamerule' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Game rule</label>
                    <select value={c.gamerule||'keepInventory'} onChange={e=> update(i,{ gamerule: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      {GAMERULES.map(rule => <option key={rule} value={rule}>{rule}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Regla personalizada</label>
                    <input value={c.gameruleCustom||''} onChange={e=> update(i,{ gameruleCustom: e.target.value })} placeholder="mod:customRule" className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Valor</label>
                    <input value={c.gameruleValue??'true'} onChange={e=> update(i,{ gameruleValue: e.target.value })} placeholder="true, false, 3..." className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                </div>
              )}

              {type==='gamemode' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Modo de juego</label>
                    <select value={c.gamemode||'survival'} onChange={e=> update(i,{ gamemode: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      {['survival','creative','adventure','spectator'].map(mode => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {type==='difficulty' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Dificultad</label>
                    <select value={c.difficulty||'normal'} onChange={e=> update(i,{ difficulty: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      {['peaceful','easy','normal','hard'].map(mode => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {(type==='experience' || type==='xp') && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Modo</label>
                    <select value={c.xpMode||'add'} onChange={e=> update(i,{ xpMode: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="add">add</option>
                      <option value="set">set</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Cantidad</label>
                    <input type="number" min={0} max={1000000} value={c.xpAmount??1} onChange={e=> update(i,{ xpAmount: Math.max(0, Math.min(1000000, parseInt(e.target.value)||0)) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Unidad</label>
                    <select value={c.xpUnit||'points'} onChange={e=> update(i,{ xpUnit: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      <option value="points">points</option>
                      <option value="levels">levels</option>
                    </select>
                  </div>
                </div>
              )}

              {type==='enchant' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="opacity-70">Encantamiento</label>
                    <select value={c.enchant||'sharpness'} onChange={e=> update(i,{ enchant: e.target.value })} className="bg-white/10 rounded px-2 py-1 text-xs">
                      {ENCHANTMENTS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="opacity-70">Nivel</label>
                    <input type="number" min={1} max={255} value={c.enchantLevel??1} onChange={e=> update(i,{ enchantLevel: Math.max(1, Math.min(255, parseInt(e.target.value)||1)) })} className="bg-white/10 rounded px-2 py-1 text-xs" />
                  </div>
                </div>
              )}

              <div className="mt-3 text-[11px] opacity-70 font-mono bg-black/30 rounded px-2 py-1 border border-white/10">
                {preview || '—'}
              </div>
              {i < commands.length-1 && (
                <div className="mt-3 flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-white/10 border border-white/15">Delay</span>
                  <input
                    type="number"
                    min={0}
                    value={c.delayMs||0}
                    onChange={e=> update(i,{ delayMs: Math.max(0, parseInt(e.target.value)||0) })}
                    className="w-24 bg-white/10 rounded px-2 py-1 text-xs"
                  />
                  <span className="opacity-60">ms antes del siguiente</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

// Force rebuild: styles removed
