import { promises as fs } from 'node:fs'
import path from 'node:path'
import { mergeStateWithDefaults } from '../src/live-control.js'
import { getStateFilePath } from './storage-paths.js'

const STATE_FILE = getStateFilePath()

export class StateStore {
  constructor(filePath = STATE_FILE) {
    this.filePath = filePath
    this.state = mergeStateWithDefaults()
    this.writeQueue = Promise.resolve()
  }

  async load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })

    try {
      const rawState = await fs.readFile(this.filePath, 'utf8')
      this.state = mergeStateWithDefaults(JSON.parse(rawState))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('No se pudo leer el state store:', error)
      }

      await this.save(this.state)
    }

    return this.getState()
  }

  getState() {
    return structuredClone(this.state)
  }

  async setState(nextState) {
    this.state = mergeStateWithDefaults(nextState)
    await this.save(this.state)
    return this.getState()
  }

  async updateProfile(partialProfile) {
    this.state = mergeStateWithDefaults({
      ...this.state,
      profile: {
        ...this.state.profile,
        ...partialProfile,
      },
    })

    await this.save(this.state)
    return this.getState()
  }

  async save(nextState) {
    const serializedState = JSON.stringify(nextState, null, 2)

    this.writeQueue = this.writeQueue.then(() =>
      fs.writeFile(this.filePath, serializedState, 'utf8'),
    )

    await this.writeQueue
  }
}
