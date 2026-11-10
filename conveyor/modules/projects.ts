import { app, dialog, shell } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as filesystem } from 'original-fs'
import { basename, join, resolve, parse, isAbsolute, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { command, defineModule, query, middleware } from '../init'
import { openProjectTerminal, executionStates } from '../../lib/main/project-terminal'

const REPOSITORY = 'https://github.com/iamgururaj/electron-blueprint.git'
// Electron's patched fs treats .asar files as directories and caches open archive
// handles. Inspect physical files so size scans cannot lock projects against trashing.
const { readFile, writeFile, rename, realpath, stat, lstat, opendir } = filesystem
const run = promisify(execFile)
const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string().optional(),
})
type Project = z.infer<typeof projectSchema>
const destinations = new Map<number, string>()
let cloning = false
const trusted = middleware(({ ctx, next }) => {
  if (!ctx.window || ctx.sender.isDestroyed() || ctx.event.senderFrame !== ctx.sender.mainFrame) {
    throw new Error('Project operations require the app main frame.')
  }
  return next()
})
const projectCommand = command.use(trusted)
const projectQuery = query.use(trusted)

async function listProjects(): Promise<Project[]> {
  try {
    return z
      .array(projectSchema)
      .parse(JSON.parse(await readFile(join(app.getPath('userData'), 'projects.json'), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error('Could not read the local projects registry.')
  }
}

async function launchTerminal(project: Project, dev: boolean) {
  const cwd = await realpath(project.path)
  if (!(await stat(cwd)).isDirectory()) throw new Error('Project folder is unavailable.')
  await openProjectTerminal(project.id, cwd, dev, app.getPath('userData'))
}

async function directorySize(path: string): Promise<number> {
  let bytes = 0
  const directory = await opendir(path)
  for await (const entry of directory) {
    const child = join(path, entry.name)
    const info = await lstat(child)
    if (info.isSymbolicLink()) continue
    if (info.isDirectory()) bytes += await directorySize(child)
    else if (info.isFile()) bytes += info.size
  }
  return bytes
}

async function projectDetails(project: Project) {
  let folderCreatedAt: string | null = null
  let sizeBytes: number | null = null
  try {
    const info = await lstat(project.path)
    if (info.isDirectory() && !info.isSymbolicLink()) {
      folderCreatedAt = info.birthtimeMs > 0 ? info.birthtime.toISOString() : null
      sizeBytes = await directorySize(project.path)
    }
  } catch {
    // Missing or unreadable folders remain visible with unavailable metadata.
  }
  return { ...project, folderCreatedAt, sizeBytes }
}

async function releaseProjectElectron(path: string) {
  if (process.platform !== 'win32') return
  const script = `$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($env:SCAFFOLD_DELETE_PATH).TrimEnd('\\') + '\\'
Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" | ForEach-Object {
  if ($_.ProcessId -ne ${process.pid} -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
  }
}`
  await run(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    {
      windowsHide: true,
      timeout: 15_000,
      env: { ...process.env, SCAFFOLD_DELETE_PATH: path },
    }
  )
}

export const projectsModule = defineModule({
  executions: projectQuery(() => executionStates()),
  list: projectQuery(async () => {
    const details: Awaited<ReturnType<typeof projectDetails>>[] = []
    for (const project of await listProjects()) details.push(await projectDetails(project))
    return details
  }),
  pickDestination: projectCommand(async ({ ctx }) => {
    const result = await dialog.showOpenDialog(ctx.window!, {
      title: 'Choose a parent folder for your new project',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = await realpath(result.filePaths[0])
    if (!destinations.has(ctx.sender.id)) {
      ctx.sender.once('destroyed', () => destinations.delete(ctx.sender.id))
    }
    destinations.set(ctx.sender.id, path)
    return path
  }),
  clone: projectCommand(
    z.object({ name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/), runDev: z.boolean() }),
    async ({ ctx, input }) => {
      if (cloning) throw new Error('Another clone is already in progress.')
      const parent = destinations.get(ctx.sender.id)
      if (!parent) throw new Error('Choose a destination folder first.')
      cloning = true
      try {
        const projects = await listProjects()
        const path = join(parent, input.name)
        try {
          await stat(path)
          throw new Error('A folder with this name already exists.')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        try {
          await run('git', ['clone', '--', REPOSITORY, path], {
            timeout: 300_000,
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
          })
        } catch {
          throw new Error(
            'Clone failed. Check Git and your network connection. A partial folder may remain; choose a new name or remove it before retrying.'
          )
        }
        const project = { id: randomUUID(), name: basename(path), path, createdAt: new Date().toISOString() }
        const file = join(app.getPath('userData'), 'projects.json')
        await writeFile(`${file}.tmp`, JSON.stringify([...projects, project], null, 2), 'utf8')
        await rename(`${file}.tmp`, file)
        let warning: string | null = null
        if (input.runDev) {
          try {
            await launchTerminal(project, true)
          } catch (error) {
            warning = (error as Error).message
          }
        }
        return { project, warning }
      } finally {
        cloning = false
      }
    }
  ),
  delete: projectCommand(z.object({ id: z.string().uuid() }), async ({ input }) => {
    if (cloning) throw new Error('Another project operation is already in progress.')
    cloning = true
    try {
      const projects = await listProjects()
      const project = projects.find((entry) => entry.id === input.id)
      if (!project) throw new Error('Unknown local project.')
      const path = resolve(project.path)
      const appPath = relative(path, app.getAppPath())
      if (appPath === '' || (!appPath.startsWith('..') && !isAbsolute(appPath))) {
        throw new Error('Cannot delete the folder containing the running scaffolder.')
      }
      if (!isAbsolute(project.path) || path === parse(path).root || basename(path) !== project.name) {
        throw new Error('Unsafe project folder. Deletion refused.')
      }
      try {
        if ((await lstat(path)).isSymbolicLink() || (await realpath(path)) !== path) {
          throw new Error('Project folder has moved or is a symbolic link. Deletion refused.')
        }
        // Release project-local Electron locks before moving the folder to OS trash.
        await releaseProjectElectron(path)
        try {
          await shell.trashItem(path)
        } catch (error) {
          if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
          await new Promise((resolve) => setTimeout(resolve, 500))
          await shell.trashItem(path)
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (error instanceof Error && /operation was aborted/i.test(error.message)) {
          throw new Error(
            'Windows could not move this folder to the Recycle Bin. Restart the scaffolder to release any previously opened archives, close apps using the folder, then retry Delete. The project remains listed.'
          )
        }
        if (['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(code ?? '')) {
          throw new Error(
            'Project folder is still locked. Close its terminal, dev server, and any apps using it, then retry Delete.'
          )
        }
        if (code !== 'ENOENT') throw error
      }
      const file = join(app.getPath('userData'), 'projects.json')
      await writeFile(
        `${file}.tmp`,
        JSON.stringify(
          projects.filter((entry) => entry.id !== input.id),
          null,
          2
        ),
        'utf8'
      )
      await rename(`${file}.tmp`, file)
    } finally {
      cloning = false
    }
  }),
  openTerminal: projectCommand(z.object({ id: z.string().uuid(), runDev: z.boolean() }), async ({ input }) => {
    const project = (await listProjects()).find((entry) => entry.id === input.id)
    if (!project) throw new Error('Unknown local project.')
    await launchTerminal(project, input.runDev)
  }),
})
