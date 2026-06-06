import express from 'express'
import path from 'node:path'
import { sanitizeTtsConfigForStorage } from '../src/config/ttsDefaults.js'
import {
  getTtsStoragePaths,
  getTtsStatus,
  listEdgeVoices,
  synthesizeToBuffer,
  synthesizeToFile,
} from './tikcontrol-tts-service.js'

export function registerTikcontrolTtsRoutes(app, { store } = {}) {
  const { uploadDir, ttsDir } = getTtsStoragePaths()

  app.use(
    '/user-uploads',
    express.static(uploadDir, {
      fallthrough: true,
      maxAge: '1h',
      setHeaders(response, filePath) {
        if (filePath.endsWith('.mp3')) {
          response.setHeader('Content-Type', 'audio/mpeg')
        } else if (filePath.endsWith('.wav')) {
          response.setHeader('Content-Type', 'audio/wav')
        }
      },
    }),
  )

  app.get('/api/tts/config', (_request, response) => {
    const state = store?.getState?.() || {}
    response.json({
      ok: true,
      config: sanitizeTtsConfigForStorage(state.tts || {}),
    })
  })

  app.post('/api/tts/config', async (request, response) => {
    if (!store?.getState) {
      response.status(503).json({ ok: false, error: 'State store no disponible' })
      return
    }

    try {
      const current = store.getState()
      const nextTts = sanitizeTtsConfigForStorage({
        ...(current.tts || {}),
        ...(request.body?.config || request.body || {}),
      })

      await store.setState({
        ...current,
        tts: nextTts,
        updatedAt: Date.now(),
      })

      response.json({ ok: true, config: nextTts })
    } catch (error) {
      response.status(500).json({ ok: false, error: error?.message || 'No se pudo guardar TTS' })
    }
  })

  app.get('/api/tts/status', async (_request, response) => {
    try {
      const status = await getTtsStatus()
      response.json({ ok: true, ...status, ttsDir })
    } catch (error) {
      response.status(500).json({ ok: false, error: error?.message || 'TTS status error' })
    }
  })

  app.get('/api/tts/voices', (_request, response) => {
    response.json({
      ok: true,
      voices: listEdgeVoices(),
      count: listEdgeVoices().length,
    })
  })

  app.post('/api/tts/synthesize', async (request, response) => {
    try {
      const body = request.body || {}
      const result = await synthesizeToFile({
        text: body.text,
        voice: body.voice,
        ratePct: body.ratePct ?? body.speed ?? 0,
        pitchSemi: body.pitchSemi ?? body.pitch ?? 0,
        volumePct: body.volumePct ?? body.volume ?? 100,
        baseName: body.baseName,
      })
      response.json(result)
    } catch (error) {
      console.error('[tts-api] synthesize:', error)
      response.status(500).json({ ok: false, error: error?.message || 'Sintesis fallida' })
    }
  })

  app.post('/api/tts/speak-buffer', async (request, response) => {
    try {
      const body = request.body || {}
      const result = await synthesizeToBuffer({
        text: body.text,
        voice: body.voice,
        ratePct: body.ratePct ?? body.speed ?? 0,
        pitchSemi: body.pitchSemi ?? body.pitch ?? 0,
        volumePct: body.volumePct ?? body.volume ?? 100,
        baseName: body.baseName || 'live',
      })

      response.json({
        ok: true,
        audioBase64: result.buffer.toString('base64'),
        mimeType: result.mimeType,
        voice: result.voice,
        method: result.method,
        url: result.url,
        size: result.buffer.length,
      })
    } catch (error) {
      console.error('[tts-api] speak-buffer:', error)
      response.status(500).json({ ok: false, error: error?.message || 'Buffer TTS fallido' })
    }
  })

  return { uploadDir, ttsDir: path.resolve(ttsDir) }
}