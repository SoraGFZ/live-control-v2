import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const providedToken = process.argv[2] || process.env.NGROK_AUTHTOKEN || ''

if (!providedToken) {
  console.error('Falta el authtoken. Usa: npm run tunnel:auth -- <TU_TOKEN>')
  process.exit(1)
}

const candidatePaths = [
  process.env.NGROK_PATH,
  path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WinGet',
    'Packages',
    'Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'ngrok.exe',
  ),
  'ngrok',
].filter(Boolean)

const ngrokPath =
  candidatePaths.find((candidatePath) => candidatePath === 'ngrok' || existsSync(candidatePath)) ||
  'ngrok'

const ngrokProcess = spawn(ngrokPath, ['config', 'add-authtoken', providedToken], {
  stdio: 'inherit',
})

ngrokProcess.on('error', (error) => {
  console.error(`No pude configurar ngrok: ${error.message}`)
  process.exit(1)
})

ngrokProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
