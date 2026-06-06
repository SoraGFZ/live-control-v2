/**
 * Generate TikControl Stream Deck PNG icons from the curated AI source sheet.
 *
 * Stream Deck consumes PNG files. The source sheet was generated as a polished
 * app-icon set, then this script crops each key and creates the inactive states.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assetsDir = path.join(__dirname, 'assets');
const sourceSheet = path.join(assetsDir, 'source', 'streamdeck-icons-ai.png');
const logoPath = path.join(__dirname, '..', '..', 'renderer', 'logo.png');

const icons = {
  action: [20, 50, 360],
  winlife: [384, 50, 360],
  'toggle-on': [728, 50, 360],
  sound: [1092, 50, 360],
  minecraft: [1461, 50, 360],
  'action-toggle-on': [20, 440, 360],
  reset: [384, 440, 360],
  profile: [728, 440, 360],
  gaming: [1092, 440, 360],
  animation: [1461, 440, 360]
};

const offIcons = {
  'toggle-off': 'toggle-on',
  'action-toggle-off': 'action-toggle-on'
};

async function cropIcon(sheet, left, top, size) {
  return sheet
    .clone()
    .extract({ left, top, width: size, height: size });
}

async function saveSizes(name, pipeline) {
  await pipeline.clone().resize(72, 72).png().toFile(path.join(assetsDir, `${name}.png`));
  await pipeline.clone().resize(144, 144).png().toFile(path.join(assetsDir, `${name}@2x.png`));
}

async function saveOffIcon(name, sourceName) {
  const muted = await sharp(path.join(assetsDir, `${sourceName}@2x.png`))
    .modulate({ brightness: 0.48, saturation: 0.25 })
    .composite([{ input: Buffer.from('<svg width="144" height="144"><rect width="144" height="144" fill="#030814" opacity="0.36"/></svg>') }])
    .png()
    .toBuffer();

  await sharp(muted)
    .resize(72, 72)
    .png()
    .toFile(path.join(assetsDir, `${name}.png`));

  await sharp(muted)
    .png()
    .toFile(path.join(assetsDir, `${name}@2x.png`));
}

async function savePluginIcon() {
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <defs>
    <linearGradient id="bg" x1="18" y1="12" x2="126" y2="132" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#111b34"/>
      <stop offset="1" stop-color="#030814"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000814" flood-opacity="0.75"/>
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#16c8ff" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="144" height="144" fill="transparent"/>
  <g filter="url(#glow)">
    <rect x="10" y="10" width="124" height="124" rx="28" fill="url(#bg)" stroke="#2b80ff" stroke-width="4"/>
    <rect x="20" y="20" width="104" height="104" rx="22" fill="none" stroke="#153b72" stroke-width="2"/>
    <image href="data:image/png;base64,${logoBase64}" x="31" y="31" width="82" height="82" preserveAspectRatio="xMidYMid meet"/>
  </g>
</svg>`;

  await sharp(Buffer.from(svg)).resize(72, 72).png().toFile(path.join(assetsDir, 'pluginIcon.png'));
  await sharp(Buffer.from(svg)).resize(144, 144).png().toFile(path.join(assetsDir, 'pluginIcon@2x.png'));
}

(async () => {
  if (!fs.existsSync(sourceSheet)) {
    throw new Error(`Missing icon source sheet: ${sourceSheet}`);
  }

  const sheet = sharp(sourceSheet);

  for (const [name, [left, top, size]] of Object.entries(icons)) {
    await saveSizes(name, await cropIcon(sheet, left, top, size));
    console.log(`Created ${name}.png and ${name}@2x.png`);
  }

  for (const [name, sourceName] of Object.entries(offIcons)) {
    await saveOffIcon(name, sourceName);
    console.log(`Created ${name}.png and ${name}@2x.png`);
  }

  await savePluginIcon();
  console.log('Created pluginIcon.png and pluginIcon@2x.png');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
