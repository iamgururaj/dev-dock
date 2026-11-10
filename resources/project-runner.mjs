// Runs in system Node inside the user's external terminal, never in the renderer.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [cwd, statusFile] = process.argv.slice(2)
let installSucceeded = false
let ready = false
let latest
function status(state, message) {
  latest = { state, message, updatedAt: Date.now(), installSucceeded, devReady: ready }
  writeFileSync(statusFile, JSON.stringify(latest))
}
// A heartbeat detects terminal closure without requiring permission to inspect another process.
const heartbeat = setInterval(() => {
  if (latest) status(latest.state, latest.message)
}, 2000)
heartbeat.unref()
const env = { ...process.env, FORCE_COLOR: '0' }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS
delete env.ELECTRON_NO_ATTACH_CONSOLE
let output = ''
function npm(args, onOutput = () => {}) {
  return new Promise((resolve, reject) => {
    // On Windows npm.cmd must be run through cmd.exe; the command contains no user input.
    const child =
      process.platform === 'win32'
        ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], {
            cwd,
            env,
            stdio: ['inherit', 'pipe', 'pipe'],
          })
        : spawn('npm', args, { cwd, env, stdio: ['inherit', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk)
      onOutput(chunk.toString())
    })
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk)
      onOutput(chunk.toString())
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}
try {
  process.chdir(cwd)
  status('installing', 'Installing dependencies…')
  const install = await npm(['install'])
  if (install.code !== 0) throw new Error(`npm install failed (${install.signal || install.code}).`)
  installSucceeded = true
  status('starting', 'Dependencies installed. Starting dev…')
  const dev = await npm(['run', 'dev'], (chunk) => {
    // Strip ANSI colour escapes before recognizing Vite's readiness message.
    // eslint-disable-next-line no-control-regex
    output = (output + chunk).slice(-8192).replace(/\x1b\[[0-9;]*m/g, '')
    // electron-vite/Vite announces readiness after binding the development server.
    if (!ready && /(?:ready in\s+\d|Local:\s+https?:\/\/)/i.test(output)) {
      ready = true
      status('running', 'Dependencies installed. Dev server ready.')
    }
  })
  if (dev.code !== 0) throw new Error(`npm run dev failed (${dev.signal || dev.code}).`)
  status('stopped', ready ? 'Dev server stopped.' : 'Dev command completed without a readiness signal.')
} catch (error) {
  status('failed', error.message)
  console.error(error.message)
  process.exitCode = 1
}
