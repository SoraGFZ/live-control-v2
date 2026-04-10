import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { detectMediaKindFromFileName } from './media-library.js'

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('No encontre ffmpeg para normalizar el video.'))
      return
    }

    const ffmpegProcess = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let errorOutput = ''

    ffmpegProcess.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString()
    })

    ffmpegProcess.on('error', (error) => {
      reject(error)
    })

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          errorOutput.trim() || `ffmpeg termino con codigo ${code}.`,
        ),
      )
    })
  })
}

export async function normalizeVideoFileForWeb(filePath) {
  const normalizedPath = path.resolve(filePath)

  if (detectMediaKindFromFileName(normalizedPath) !== 'video') {
    return {
      normalized: false,
      filePath: normalizedPath,
    }
  }

  const temporaryOutputPath = `${normalizedPath}.normalized.mp4`

  try {
    await fs.rm(temporaryOutputPath, { force: true })
    await runFfmpeg([
      '-y',
      '-i',
      normalizedPath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      temporaryOutputPath,
    ])

    await fs.rename(temporaryOutputPath, normalizedPath)

    return {
      normalized: true,
      filePath: normalizedPath,
    }
  } catch (error) {
    await fs.rm(temporaryOutputPath, { force: true }).catch(() => {})
    throw error
  }
}
