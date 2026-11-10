import { describe, it, expect } from 'vitest'
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
describe('Real npm runner', () => {
  it.each(['success', 'install-failure', 'dev-failure'])(
    'reports %s and runs in the selected directory',
    async (mode) => {
      const cache = join(process.cwd(), 'node_modules', '.cache')
      await mkdir(cache, { recursive: true })
      const folder = await mkdtemp(join(cache, "scaffolder space & quote'"))
      try {
        await writeFile(
          join(folder, 'package.json'),
          JSON.stringify({
            name: 'scaffolder-fixture',
            version: '1.0.0',
            scripts: { install: 'node install.cjs', dev: 'node dev.cjs' },
          })
        )
        await writeFile(
          join(folder, 'install.cjs'),
          `require('fs').writeFileSync('install-cwd.txt', process.cwd()); process.exit(${mode === 'install-failure' ? 7 : 0})`
        )
        await writeFile(
          join(folder, 'dev.cjs'),
          `require('fs').writeFileSync('dev-cwd.txt', process.cwd()); console.log('VITE ready in 10 ms'); setTimeout(() => process.exit(${mode === 'dev-failure' ? 9 : 0}), 200)`
        )
        const statusFile = join(folder, 'status.json')
        await exec(process.execPath, [resolve('resources/project-runner.mjs'), folder, statusFile], {
          timeout: 30_000,
        }).catch((error) => {
          if (mode === 'success') throw error
        })
        const status = JSON.parse(await readFile(statusFile, 'utf8'))
        expect(await readFile(join(folder, 'install-cwd.txt'), 'utf8')).toBe(folder)
        if (mode === 'install-failure') {
          expect(status.state).toBe('failed')
          expect(status.installSucceeded).toBe(false)
          await expect(readFile(join(folder, 'dev-cwd.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
        } else {
          expect(await readFile(join(folder, 'dev-cwd.txt'), 'utf8')).toBe(folder)
          expect(status.installSucceeded).toBe(true)
          expect(status.devReady).toBe(true)
          expect(status.state).toBe(mode === 'success' ? 'stopped' : 'failed')
        }
      } finally {
        await rm(folder, { recursive: true, force: true })
      }
    },
    40_000
  )
})
