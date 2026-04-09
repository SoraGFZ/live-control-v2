import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getMediaDirectoryPath } from './storage-paths.js'

const MEDIA_DIRECTORY = getMediaDirectoryPath()

function sanitizeFileBaseName(value) {
  return String(value || 'media')
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
}

function detectMediaKindFromName(fileName) {
  const lowerName = fileName.toLowerCase()

  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(lowerName)) {
    return 'video'
  }

  if (/\.(mp3|wav|m4a|aac|flac)$/.test(lowerName)) {
    return 'audio'
  }

  if (/\.(gif|png|jpg|jpeg|webp|svg)$/.test(lowerName)) {
    return 'image'
  }

  return 'other'
}

function toMediaRecord(dirent, stats) {
  return {
    id: dirent.name,
    fileName: dirent.name,
    url: `/media/${encodeURIComponent(dirent.name)}`,
    size: stats.size,
    createdAt: stats.birthtimeMs || stats.mtimeMs,
    updatedAt: stats.mtimeMs,
    kind: detectMediaKindFromName(dirent.name),
  }
}

export async function ensureMediaDirectory() {
  await fs.mkdir(MEDIA_DIRECTORY, { recursive: true })
  return MEDIA_DIRECTORY
}

export function getMediaDirectory() {
  return MEDIA_DIRECTORY
}

export function createStoredMediaName(originalName) {
  const extension = path.extname(originalName || '').toLowerCase()
  const baseName = path.basename(originalName || 'media', extension)
  const safeBaseName = sanitizeFileBaseName(baseName) || 'media'
  const stamp = `${Date.now()}-${Math.round(Math.random() * 100000)}`
  return `${stamp}-${safeBaseName}${extension}`
}

export async function listMediaItems() {
  await ensureMediaDirectory()
  const dirents = await fs.readdir(MEDIA_DIRECTORY, { withFileTypes: true })
  const files = dirents.filter((dirent) => dirent.isFile())
  const mediaItems = await Promise.all(
    files.map(async (dirent) => {
      const stats = await fs.stat(path.join(MEDIA_DIRECTORY, dirent.name))
      return toMediaRecord(dirent, stats)
    }),
  )

  return mediaItems.sort((a, b) => b.createdAt - a.createdAt)
}

export async function removeMediaItem(fileName) {
  await ensureMediaDirectory()
  const decodedFileName = decodeURIComponent(fileName)
  await fs.unlink(path.join(MEDIA_DIRECTORY, decodedFileName))
}
