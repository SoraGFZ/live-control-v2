import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const storageDirectory = path.join(projectRoot, 'storage')
const tunnelUrlFile = path.join(storageDirectory, 'active-tunnel-url.txt')
const tunnelPort = Number(process.env.TUNNEL_PORT || 5123)

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

function resolveNgrokPath() {
  return (
    candidatePaths.find((candidatePath) => candidatePath === 'ngrok' || existsSync(candidatePath)) ||
    'ngrok'
  )
}

async function syncPublicUrl(publicBaseUrl) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${tunnelPort}/api/state`)

      if (!response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        continue
      }

      const state = await response.json()
      state.profile.publicBaseUrl = publicBaseUrl

      await fetch(`http://127.0.0.1:${tunnelPort}/api/state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
}

mkdirSync(storageDirectory, { recursive: true })

const ngrokProcess = spawn(resolveNgrokPath(), ['http', String(tunnelPort), '--log', 'stdout'], {
  cwd: projectRoot,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
})

let bufferedStdout = ''
let latestPublicUrl = ''

function handleStdoutChunk(chunk) {
  const textChunk = chunk.toString()
  process.stdout.write(textChunk)
  bufferedStdout += textChunk

  const lines = bufferedStdout.split(/\r?\n/)
  bufferedStdout = lines.pop() || ''

  lines.forEach((line) => {
    const matchedUrl =
      line.match(/https:\/\/[a-z0-9-]+\.ngrok-free\.app/i)?.[0] ||
      line.match(/https:\/\/[a-z0-9-]+\.ngrok\.app/i)?.[0]

    if (!matchedUrl || matchedUrl === latestPublicUrl) {
      return
    }

    latestPublicUrl = matchedUrl
    writeFileSync(tunnelUrlFile, `${matchedUrl}\n`, 'utf8')
    console.log(`Public URL: ${matchedUrl}`)
    void syncPublicUrl(matchedUrl)
  })
}

ngrokProcess.stdout.on('data', handleStdoutChunk)
ngrokProcess.stderr.on('data', (chunk) => {
  const textChunk = chunk.toString()
  process.stderr.write(textChunk)

  if (/ERR_NGROK_4018|authtoken/i.test(textChunk)) {
    console.error(
      'Ngrok necesita tu authtoken. Ejecuta: npm run tunnel:auth -- <TU_TOKEN>',
    )
  }
})

function closeTunnel(signalCode = 0) {
  if (!ngrokProcess.killed) {
    ngrokProcess.kill('SIGTERM')
  }

  process.exit(signalCode)
}

process.on('SIGINT', () => closeTunnel(0))
process.on('SIGTERM', () => closeTunnel(0))

ngrokProcess.on('error', (error) => {
  console.error(`No pude iniciar ngrok: ${error.message}`)
  process.exit(1)
})

ngrokProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
