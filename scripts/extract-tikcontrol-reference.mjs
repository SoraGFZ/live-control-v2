import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import asar from '@electron/asar'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const asarPath = 'C:/Users/Sora/AppData/Local/Programs/TikControl/resources/app.asar'
const outRoot = path.join(projectRoot, 'storage', 'tikcontrol-reference')

const wantedFragments = [
  'renderer/styles/themes/light/global.css',
  'renderer/styles/themes/light/index.css',
  'renderer/styles/themes/light/home.css',
  'renderer/styles/themes/light/widgets.css',
  'renderer/styles/themes/light/overlay.css',
  'renderer/styles/themes/light/actions.css',
  'renderer/styles/light-theme.css',
  'renderer/app.js',
  'renderer/index.html',
]

const entries = asar.listPackage(asarPath)

mkdirSync(outRoot, { recursive: true })

for (const fragment of wantedFragments) {
  const normalizedFragment = fragment.replace(/\//g, '\\')
  const hit = entries.find((entry) => entry.toLowerCase().endsWith(normalizedFragment.toLowerCase()))

  if (!hit) {
    console.log(`MISS ${fragment}`)
    continue
  }

  const destination = path.join(outRoot, fragment)
  mkdirSync(path.dirname(destination), { recursive: true })
  const asarEntry = hit.replace(/^\\+/, '').replace(/\\/g, '/')
  asar.extractFile(asarPath, asarEntry, destination)
  console.log(`OK ${fragment}`)
}

const htmlFiles = entries.filter(
  (entry) => /\\renderer\\.*\.html$/i.test(entry) && !/widgets-built|node_modules/i.test(entry),
)
console.log('\nRenderer HTML samples:')
htmlFiles.slice(0, 20).forEach((entry) => console.log(entry))