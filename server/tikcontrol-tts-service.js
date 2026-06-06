import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const execFileAsync = promisify(execFile)

const EDGE_VOICES_ES = [
  { key: 'es-ES-ElviraNeural', label: 'Elvira (ES)', lang: 'es-ES' },
  { key: 'es-ES-AlvaroNeural', label: 'Alvaro (ES)', lang: 'es-ES' },
  { key: 'es-MX-DaliaNeural', label: 'Dalia (MX)', lang: 'es-MX' },
  { key: 'es-MX-JorgeNeural', label: 'Jorge (MX)', lang: 'es-MX' },
  { key: 'es-US-AlonsoNeural', label: 'Alonso (US)', lang: 'es-US' },
  { key: 'es-US-PalomaNeural', label: 'Paloma (US)', lang: 'es-US' },
  { key: 'en-US-JennyNeural', label: 'Jenny (EN)', lang: 'en-US' },
  { key: 'en-US-GuyNeural', label: 'Guy (EN)', lang: 'en-US' },
]

let edgeTtsProbe = null

function getUploadRoots() {
  const roots = []
  const appData = process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming')

  try {
    roots.push(path.join(appData, 'live-control-app', 'uploads'))
  } catch {
    // ignore
  }

  try {
    roots.push(path.join(process.cwd(), 'storage', 'uploads'))
  } catch {
    // ignore
  }

  return [...new Set(roots)]
}

function ensureWritableDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
  const probe = path.join(dirPath, `.write-test-${process.pid}`)
  fs.writeFileSync(probe, 'ok')
  fs.unlinkSync(probe)
  return dirPath
}

export function getTtsStoragePaths() {
  for (const base of getUploadRoots()) {
    try {
      ensureWritableDir(base)
      const ttsDir = path.join(base, 'tts')
      ensureWritableDir(ttsDir)
      return { base, uploadDir: base, ttsDir }
    } catch {
      // try next
    }
  }

  const fallback = path.join(process.env.TEMP || '/tmp', 'live-control-app', 'uploads')
  ensureWritableDir(fallback)
  const ttsDir = path.join(fallback, 'tts')
  ensureWritableDir(ttsDir)
  return { base: path.dirname(fallback), uploadDir: fallback, ttsDir }
}

function sanitizeBaseName(value) {
  return String(value || 'tts')
    .slice(0, 80)
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'tts'
}

function uniqueFilePath(dir, baseName, extension) {
  let fileName = `${baseName}${extension}`
  let attempt = 2

  while (attempt < 9999) {
    const abs = path.join(dir, fileName)
    if (!fs.existsSync(abs)) {
      return { fileName, abs }
    }
    fileName = `${baseName}_${attempt}${extension}`
    attempt += 1
  }

  fileName = `${baseName}_${Date.now()}${extension}`
  return { fileName, abs: path.join(dir, fileName) }
}

function buildProsody({ ratePct = 0, pitchSemi = 0, volumePct = 100 } = {}) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0))
  const rate = clamp(ratePct, -50, 50)
  const pitch = clamp(pitchSemi, -12, 12)
  const volume = clamp(volumePct, 0, 100)
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

  return {
    rate: rate === 0 ? 'default' : `${signed(rate)}%`,
    pitch: pitch === 0 ? 'default' : `${signed(pitch)}st`,
    volume: volume === 100 ? 'default' : `${volume}%`,
  }
}

function cultureFromVoice(voice) {
  const match = /^([a-z]{2}-[A-Z]{2})/.exec(String(voice || ''))
  return match ? match[1] : ''
}

export async function probeEdgeTtsAvailable() {
  if (edgeTtsProbe !== null) {
    return edgeTtsProbe
  }

  edgeTtsProbe = await new Promise((resolve) => {
    const child = spawn('npx', ['--yes', 'edge-tts', '--version'], {
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let settled = false
    const finish = (value) => {
      if (settled) {
        return
      }
      settled = true
      resolve(value)
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      finish(false)
    }, 12000)

    child.on('error', () => {
      clearTimeout(timer)
      finish(false)
    })

    child.on('exit', (code) => {
      clearTimeout(timer)
      finish(code === 0)
    })
  })

  return edgeTtsProbe
}

function runEdgeTtsCli({ voice, text, outputPath, rate, pitch, volume }) {
  return new Promise((resolve, reject) => {
    const args = ['--yes', 'edge-tts', '--voice', String(voice || 'es-ES-ElviraNeural'), '--text', String(text || '')]
    args.push('--write-media', outputPath)

    if (rate && rate !== 'default') {
      args.push('--rate', String(rate))
    }
    if (pitch && pitch !== 'default') {
      args.push('--pitch', String(pitch))
    }
    if (volume && volume !== 'default') {
      args.push('--volume', String(volume))
    }

    const child = spawn('npx', args, {
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      reject(new Error('edge-tts timeout'))
    }, 20000)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`edge-tts exit ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
  })
}

async function synthesizeWindowsSapi({ text, voice, ratePct = 0, volumePct = 100, outputPath }) {
  if (process.platform !== 'win32') {
    throw new Error('Windows SAPI solo disponible en Windows')
  }

  const culture = cultureFromVoice(voice)
  const rate = Math.max(-10, Math.min(10, Math.round((Number(ratePct) || 0) / 5)))
  const volume = Math.max(0, Math.min(100, Math.round(Number(volumePct) || 100)))

  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:LC_TTS_TEXT_B64))
$out = $env:LC_TTS_OUT
$culture = $env:LC_TTS_CULTURE
$rate = [int]$env:LC_TTS_RATE
$volume = [int]$env:LC_TTS_VOLUME
$dir = [System.IO.Path]::GetDirectoryName($out)
if ($dir -and !(Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.Rate = $rate
  $synth.Volume = $volume
  if ($culture) {
    $voiceInfo = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq $culture } | Select-Object -First 1
    if ($voiceInfo) { $synth.SelectVoice($voiceInfo.VoiceInfo.Name) }
  }
  $synth.SetOutputToWaveFile($out)
  $synth.Speak($text)
} finally {
  $synth.Dispose()
}
`

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    {
      windowsHide: true,
      timeout: 15000,
      env: {
        ...process.env,
        LC_TTS_TEXT_B64: Buffer.from(String(text || ''), 'utf8').toString('base64'),
        LC_TTS_OUT: outputPath,
        LC_TTS_CULTURE: culture,
        LC_TTS_RATE: String(rate),
        LC_TTS_VOLUME: String(volume),
      },
    },
  )
}

export async function getTtsStatus() {
  const edge = await probeEdgeTtsAvailable()
  return {
    edge,
    windowsSapi: process.platform === 'win32',
    platform: process.platform,
    preferred: edge ? 'edge' : process.platform === 'win32' ? 'sapi' : 'none',
  }
}

export function listEdgeVoices() {
  return EDGE_VOICES_ES
}

export async function synthesizeToFile({
  text,
  voice = 'es-ES-ElviraNeural',
  ratePct = 0,
  pitchSemi = 0,
  volumePct = 100,
  baseName,
} = {}) {
  const trimmed = String(text || '').trim().slice(0, 3000)
  if (!trimmed) {
    throw new Error('Texto TTS vacio')
  }

  const { ttsDir } = getTtsStoragePaths()
  const safeBase = sanitizeBaseName(baseName || voice)
  const prosody = buildProsody({ ratePct, pitchSemi, volumePct })
  const edgeOk = await probeEdgeTtsAvailable()

  let lastError = null

  if (edgeOk) {
    const { fileName, abs } = uniqueFilePath(ttsDir, safeBase, '.mp3')
    try {
      await runEdgeTtsCli({
        voice,
        text: trimmed,
        outputPath: abs,
        ...prosody,
      })
      const stat = fs.statSync(abs)
      if (!stat?.size) {
        throw new Error('Archivo TTS vacio')
      }
      return {
        ok: true,
        url: `/user-uploads/tts/${fileName}`,
        filePath: abs,
        fileName,
        mimeType: 'audio/mpeg',
        method: 'edge',
        voice,
      }
    } catch (error) {
      lastError = error
      try {
        if (fs.existsSync(abs)) {
          fs.unlinkSync(abs)
        }
      } catch {
        // ignore
      }
    }
  }

  if (process.platform === 'win32') {
    const { fileName, abs } = uniqueFilePath(ttsDir, `${safeBase}_sapi`, '.wav')
    try {
      await synthesizeWindowsSapi({
        text: trimmed,
        voice,
        ratePct,
        volumePct,
        outputPath: abs,
      })
      const stat = fs.statSync(abs)
      if (!stat?.size) {
        throw new Error('Archivo TTS vacio (SAPI)')
      }
      return {
        ok: true,
        url: `/user-uploads/tts/${fileName}`,
        filePath: abs,
        fileName,
        mimeType: 'audio/wav',
        method: 'windows-sapi',
        voice: voice || 'windows-default',
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No hay motor TTS disponible (instala edge-tts con npx o usa Windows)')
}

export async function synthesizeToBuffer(options = {}) {
  const fileResult = await synthesizeToFile(options)
  const buffer = fs.readFileSync(fileResult.filePath)
  return {
    buffer,
    mimeType: fileResult.mimeType,
    voice: fileResult.voice,
    method: fileResult.method,
    fileName: fileResult.fileName,
    url: fileResult.url,
  }
}