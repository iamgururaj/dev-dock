import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import runner from '../../resources/project-runner.mjs?raw'

const exec = promisify(execFile)
const executions = new Map<string, { file: string; started: number }>()
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
const encode = (value: string) => Buffer.from(value, 'utf16le').toString('base64')

export async function executionStates() {
  return Promise.all(
    [...executions].map(async ([id, execution]) => {
      try {
        const data = JSON.parse(await readFile(execution.file, 'utf8')) as {
          state: string
          message: string
          updatedAt: number
        }
        if (['installing', 'starting', 'running'].includes(data.state)) {
          if (Date.now() - data.updatedAt > 15_000) {
            return { id, state: 'stopped', message: 'Terminal closed.' }
          }
        }
        return { id, state: data.state, message: data.message }
      } catch {
        return {
          id,
          state: Date.now() - execution.started > 20_000 ? 'failed' : 'opening',
          message:
            Date.now() - execution.started > 20_000
              ? 'Terminal did not start the commands. Check Node.js and your terminal.'
              : 'Opening terminal…',
        }
      }
    })
  )
}

export async function openProjectTerminal(id: string, cwd: string, dev: boolean, userData: string) {
  let runnerPath = ''
  let statusPath = ''
  if (dev) {
    const active = (await executionStates()).find((entry) => entry.id === id)
    if (active && ['opening', 'installing', 'starting', 'running'].includes(active.state)) {
      throw new Error('This project is already running in a terminal.')
    }
    // Check the system runtime, rather than accidentally invoking Electron as Node.
    try {
      await exec('node', ['--version'], { cwd, windowsHide: true })
    } catch {
      throw new Error('Node.js is unavailable. Install Node.js and reopen the app.')
    }
    const directory = join(userData, 'project-runs')
    await mkdir(directory, { recursive: true })
    runnerPath = join(directory, 'runner.mjs')
    statusPath = join(directory, `${randomUUID()}.json`)
    await writeFile(runnerPath, runner, 'utf8')
  }
  if (process.platform === 'win32') {
    const script = `Set-Location -LiteralPath ${quote(cwd)}; ${dev ? `& node ${quote(runnerPath)} ${quote(cwd)} ${quote(statusPath)}` : ''}`
    // Start-Process creates a visible console even when Electron has no attached console.
    // Encode the entire inner script so spaces, quotes and shell metacharacters stay literal.
    await exec(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encode(
          `$ErrorActionPreference = 'Stop'; Start-Process -FilePath powershell.exe -WorkingDirectory ${quote(cwd)} -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-EncodedCommand','${encode(script)}')`
        ),
      ],
      { cwd, windowsHide: true }
    )
  } else {
    const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
    const script = `cd -- ${shellQuote(cwd)}${dev ? ` && node ${shellQuote(runnerPath)} ${shellQuote(cwd)} ${shellQuote(statusPath)}` : ''}`
    if (process.platform === 'darwin') {
      await exec('/usr/bin/osascript', [
        '-e',
        `tell application "Terminal" to do script ${JSON.stringify(script)}`,
        '-e',
        'tell application "Terminal" to activate',
      ])
    } else {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('x-terminal-emulator', ['-e', 'sh', '-c', `${script}; exec sh`], {
          cwd,
          detached: true,
          stdio: 'ignore',
        })
        child.once('error', reject)
        child.once('spawn', () => {
          child.unref()
          resolve()
        })
      })
    }
  }
  if (dev) executions.set(id, { file: statusPath, started: Date.now() })
}
