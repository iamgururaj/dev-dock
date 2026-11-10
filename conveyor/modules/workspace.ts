import { app, dialog, shell } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, relative, isAbsolute, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { command, query, middleware, defineModule } from '../init'
import { openProjectTerminal } from '../../lib/main/project-terminal'

const trusted = middleware(({ ctx, next }) => {
  if (!ctx.window || ctx.sender.isDestroyed() || ctx.event.senderFrame !== ctx.sender.mainFrame)
    throw new Error('Main frame required.')
  return next()
})
const cmd = command.use(trusted)
const qry = query.use(trusted)
const runFile = promisify(execFile)
const id = z.string().uuid()
const item = z.object({ id, name: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(4000) })
const configSchema = z.object({
  commands: z.array(item).max(100),
  urls: z.array(item).max(100),
  notes: z.string().max(20000),
  lastOpened: z.string().optional(),
})
type Config = z.infer<typeof configSchema>
type Project = { id: string; name: string; path: string; createdAt?: string }
const running = new Map<
  string,
  {
    child: ChildProcess
    output: string
    status: string
    stopping: boolean
    projectId: string
    name: string
    started: string
  }
>()
const registry = () => join(app.getPath('userData'), 'projects.json')
const configFile = (projectId: string) => join(app.getPath('userData'), `workspace-${projectId}.json`)
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}
async function save(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(temp, file)
}
async function projects() {
  return readJson<Project[]>(registry(), [])
}
async function project(projectId: string) {
  const p = (await projects()).find((p) => p.id === projectId)
  if (!p) throw new Error('Project is no longer registered.')
  return p
}
async function config(projectId: string): Promise<Config> {
  return configSchema.parse(await readJson(configFile(projectId), { commands: [], urls: [], notes: '' }))
}
async function details(p: Project) {
  let branch: string | null = null,
    changes: number | null = null
  const stack: string[] = []
  try {
    const [b, s] = await Promise.all([
      runFile('git', ['branch', '--show-current'], { cwd: p.path, timeout: 5000, windowsHide: true }),
      runFile('git', ['status', '--porcelain'], { cwd: p.path, timeout: 5000, windowsHide: true }),
    ])
    branch = b.stdout.trim() || 'detached'
    changes = s.stdout.split('\n').filter(Boolean).length
  } catch {
    /* Not a repository or unavailable. */
  }
  try {
    const entries = new Set(await fs.readdir(p.path))
    if (entries.has('package.json')) {
      const pkg = JSON.parse(await fs.readFile(join(p.path, 'package.json'), 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.react) stack.push('React')
      if (deps.electron) stack.push('Electron')
      if (!stack.length) stack.push('Node.js')
    }
    if (entries.has('pyproject.toml') || entries.has('requirements.txt')) stack.push('Python')
    if (entries.has('pom.xml') || entries.has('build.gradle')) stack.push('Java')
  } catch {
    /* Folder may be offline. */
  }
  const c = await config(p.id)
  return { ...p, branch, changes, stack, lastOpened: c.lastOpened }
}
async function stop(key: string) {
  const entry = running.get(key)
  if (!entry || entry.status !== 'running' || !entry.child.pid) return
  entry.stopping = true
  if (process.platform === 'win32')
    await runFile('taskkill', ['/pid', String(entry.child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {})
  else {
    try {
      process.kill(-entry.child.pid, 'SIGTERM')
    } catch {
      entry.child.kill('SIGTERM')
    }
  }
}
app.on('before-quit', () => {
  for (const key of running.keys()) void stop(key)
})
export const workspaceModule = defineModule({
  list: qry(async () => Promise.all((await projects()).map(details))),
  register: cmd(z.object({ scan: z.boolean() }), async ({ ctx, input }) => {
    const selected = await dialog.showOpenDialog(ctx.window!, { properties: ['openDirectory'] })
    if (selected.canceled || !selected.filePaths[0]) return 0
    const root = await fs.realpath(selected.filePaths[0])
    const paths = input.scan
      ? (await fs.readdir(root, { withFileTypes: true }))
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => join(root, e.name))
      : [root]
    const all = await projects()
    let added = 0
    for (const candidate of paths) {
      const path = await fs.realpath(candidate)
      if (input.scan) {
        const files = new Set(await fs.readdir(path))
        if (
          ![
            '.git',
            'package.json',
            'pyproject.toml',
            'requirements.txt',
            'pom.xml',
            'build.gradle',
            'Cargo.toml',
            'go.mod',
          ].some((f) => files.has(f))
        )
          continue
      }
      if (
        all.some((p) => (process.platform === 'win32' ? p.path.toLowerCase() === path.toLowerCase() : p.path === path))
      )
        continue
      all.push({ id: randomUUID(), name: basename(path), path, createdAt: new Date().toISOString() })
      added++
    }
    if (added) await save(registry(), all)
    return added
  }),
  relocate: cmd(
    z.object({ id, name: z.string().trim().min(1).max(100).optional(), move: z.boolean() }),
    async ({ ctx, input }) => {
      const all = await projects()
      const p = all.find((entry) => entry.id === input.id)
      if (!p) throw new Error('Project is no longer registered.')
      if ([...running.values()].some((entry) => entry.projectId === p.id && entry.status === 'running'))
        throw new Error('Stop running commands first.')
      const source = await fs.realpath(p.path)
      if (source === parse(source).root || (await fs.lstat(p.path)).isSymbolicLink())
        throw new Error('This folder cannot be moved safely.')
      const appPath = relative(source, app.getAppPath())
      if (!appPath || (!appPath.startsWith('..') && !isAbsolute(appPath)))
        throw new Error('Cannot move the running application folder.')
      const name = input.name ?? basename(source)
      if (
        name === '.' ||
        name === '..' ||
        /[\\/<>:"|?*\x00-\x1f]/.test(name) ||
        /[. ]$/.test(name) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)
      )
        throw new Error('Enter a valid folder name.')
      let parent = dirname(source)
      if (input.move) {
        const selection = await dialog.showOpenDialog(ctx.window!, {
          title: 'Choose destination folder',
          properties: ['openDirectory'],
        })
        if (selection.canceled || !selection.filePaths[0]) return
        parent = await fs.realpath(selection.filePaths[0])
      }
      const target = join(parent, name)
      const rel = relative(source, target)
      if (!rel || (!rel.startsWith('..') && !isAbsolute(rel)))
        throw new Error('Choose a destination outside the project folder.')
      if (
        all.some(
          (entry) =>
            entry.id !== p.id &&
            (entry.path === target || entry.path.startsWith(source + (process.platform === 'win32' ? '\\' : '/')))
        )
      )
        throw new Error('Destination or nested project is already registered.')
      try {
        await fs.lstat(target)
        throw new Error('Destination already exists.')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      try {
        await fs.rename(source, target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EXDEV')
          throw new Error('Moving between drives is not supported.')
        throw error
      }
      p.path = target
      p.name = name
      try {
        await save(registry(), all)
      } catch (error) {
        try {
          await fs.rename(target, source)
        } catch {
          throw new Error('Registry update and rollback failed. Folder is at ' + target)
        }
        throw error
      }
    }
  ),
  remove: cmd(id, async ({ input }) => {
    await project(input)
    if ([...running.values()].some((entry) => entry.projectId === input && entry.status === 'running'))
      throw new Error('Stop running commands before removing this project.')
    await save(
      registry(),
      (await projects()).filter((p) => p.id !== input)
    )
  }),
  get: qry(id, async ({ input }) => {
    await project(input)
    return config(input)
  }),
  save: cmd(z.object({ id, config: configSchema }), async ({ input }) => {
    await project(input.id)
    await save(configFile(input.id), input.config)
  }),
  opened: cmd(id, async ({ input }) => {
    await project(input)
    const c = await config(input)
    c.lastOpened = new Date().toISOString()
    await save(configFile(input), c)
  }),
  terminal: cmd(id, async ({ input }) => {
    const p = await project(input)
    await openProjectTerminal(p.id, await fs.realpath(p.path), false, app.getPath('userData'))
  }),
  editor: cmd(z.object({ id, editor: z.enum(['code', 'zed']) }), async ({ input }) => {
    const p = await project(input.id)
    await runFile(input.editor, [p.path], { timeout: 10000, windowsHide: true })
  }),
  openUrl: cmd(
    z
      .string()
      .url()
      .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol)),
    async ({ input }) => shell.openExternal(input)
  ),
  executions: qry(() =>
    [...running.entries()].map(([key, { output, status, projectId, name, started }]) => ({
      key,
      output,
      status,
      projectId,
      name,
      started,
    }))
  ),
  start: cmd(z.object({ projectId: id, commandId: id }), async ({ input }) => {
    const p = await project(input.projectId)
    const c = (await config(p.id)).commands.find((c) => c.id === input.commandId)
    if (!c) throw new Error('Command no longer exists.')
    const key = `${p.id}:${c.id}`
    if (running.get(key)?.status === 'running') throw new Error('Command is already running.')
    const cwd = await fs.realpath(p.path)
    const child = spawn(c.value, {
      cwd,
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const entry = {
      child,
      output: '',
      status: 'running',
      stopping: false,
      projectId: p.id,
      name: c.name,
      started: new Date().toISOString(),
    }
    running.set(key, entry)
    const append = (data: Buffer) => {
      entry.output = (entry.output + data.toString()).slice(-100000)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.on('error', (error) => {
      entry.output += `\n${error.message}`
      entry.status = 'error'
    })
    child.on('close', (code) => {
      if (entry.status !== 'error') entry.status = entry.stopping ? 'stopped' : code === 0 ? 'completed' : 'error'
    })
  }),
  stop: cmd(z.object({ projectId: id, commandId: id }), async ({ input }) => {
    await project(input.projectId)
    await stop(`${input.projectId}:${input.commandId}`)
  }),
})
