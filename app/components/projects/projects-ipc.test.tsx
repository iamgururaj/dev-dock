import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import { createCaller, type Router } from 'electron-conveyor/define'
import type { AppContext } from '@/conveyor/init'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
  lstat: vi.fn(),
  trashItem: vi.fn(),
  opendir: vi.fn(),
  realpath: vi.fn(),
  picker: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
  terminal: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/userdata', getAppPath: () => process.cwd() },
  dialog: { showOpenDialog: mocks.picker },
  shell: { trashItem: mocks.trashItem },
}))
vi.mock('original-fs', () => ({
  promises: {
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
    rename: mocks.rename,
    stat: mocks.stat,
    lstat: mocks.lstat,
    opendir: mocks.opendir,
    realpath: mocks.realpath,
  },
}))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile, spawn: mocks.spawn }))
vi.mock('@/lib/main/project-terminal', () => ({ openProjectTerminal: mocks.terminal, executionStates: async () => [] }))
import { projectsModule } from '@/conveyor/modules/projects'

const frame = {} as WebContents['mainFrame']
const sender = { id: 42, mainFrame: frame, isDestroyed: () => false, once: vi.fn() } as unknown as WebContents
const router = { modules: { projects: projectsModule } } as Router<{ projects: typeof projectsModule }>
function caller(mainFrame = true) {
  return createCaller(router, {
    ctx: {
      appStartedAt: 0,
      windows: {} as AppContext['windows'],
      openWindow: vi.fn(),
      window: {} as BrowserWindow,
      sender,
      event: { senderFrame: mainFrame ? frame : {} } as IpcMainInvokeEvent,
    },
  }).projects
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.readFile.mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' }))
  mocks.realpath.mockImplementation(async (path) => path)
  mocks.stat.mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' }))
  mocks.picker.mockResolvedValue({ canceled: false, filePaths: ['/selected folder'] })
  mocks.execFile.mockImplementation((_file, _args, _options, callback) => callback(null, '', ''))
})

describe('Project IPC boundary', () => {
  it('explains a Windows trash abort and keeps the registry entry', async () => {
    const project = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      name: 'abort-fixture',
      path: resolve('abort-fixture'),
    }
    mocks.readFile.mockResolvedValue(JSON.stringify([project]))
    mocks.lstat.mockResolvedValue({ isSymbolicLink: () => false })
    mocks.trashItem.mockRejectedValue(new Error('Operation was aborted'))
    await expect(caller().delete({ id: project.id })).rejects.toThrow('Restart the scaffolder')
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
  it('counts an ASAR as one physical file without opening it as a directory', async () => {
    const path = resolve('archive-fixture')
    const project = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'archive-fixture', path }
    mocks.readFile.mockResolvedValue(JSON.stringify([project]))
    mocks.lstat.mockImplementation(async (target) => ({
      isDirectory: () => target === path,
      isFile: () => target !== path,
      isSymbolicLink: () => false,
      size: 110835,
      birthtimeMs: 0,
    }))
    mocks.opendir.mockImplementation(async () =>
      (async function* () {
        yield { name: 'default_app.asar' }
      })()
    )
    expect(await caller().list()).toEqual([{ ...project, folderCreatedAt: null, sizeBytes: 110835 }])
    expect(mocks.opendir).toHaveBeenCalledTimes(1)
    expect(mocks.opendir).toHaveBeenCalledWith(path)
  })
  it('measures nested files, skips links, and reads folder creation independently of scaffold creation', async () => {
    const path = resolve('metadata-fixture')
    const folderDate = new Date('2026-01-02T03:04:05Z')
    const project = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'metadata-fixture', path }
    mocks.readFile.mockResolvedValue(JSON.stringify([project]))
    mocks.lstat.mockImplementation(async (target) => ({
      isDirectory: () => target === path || target === resolve(path, 'nested'),
      isSymbolicLink: () => target === resolve(path, 'link'),
      isFile: () => target === resolve(path, 'file') || target === resolve(path, 'nested', 'file'),
      size: 750_000,
      birthtime: folderDate,
      birthtimeMs: folderDate.getTime(),
    }))
    mocks.opendir.mockImplementation(async (target) =>
      (async function* () {
        for (const name of target === path ? ['file', 'nested', 'link'] : ['file']) yield { name }
      })()
    )
    expect(await caller().list()).toEqual([
      { ...project, folderCreatedAt: folderDate.toISOString(), sizeBytes: 1_500_000 },
    ])
    mocks.lstat.mockRejectedValue(new Error('Missing folder'))
    expect(await caller().list()).toEqual([{ ...project, folderCreatedAt: null, sizeBytes: null }])
  })
  it('retries a busy Electron folder before removing its registry entry', async () => {
    const project = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      name: 'locked-fixture',
      path: resolve('locked-fixture'),
    }
    mocks.readFile.mockResolvedValue(JSON.stringify([project]))
    mocks.lstat.mockResolvedValue({ isSymbolicLink: () => false })
    mocks.trashItem.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
    await caller().delete({ id: project.id })
    expect(mocks.trashItem).toHaveBeenCalledTimes(2)
    expect(mocks.trashItem).toHaveBeenLastCalledWith(project.path)
    expect(mocks.rename).toHaveBeenCalled()
  })
  it('retains the registry entry and explains a persistent lock', async () => {
    const project = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      name: 'locked-fixture',
      path: resolve('locked-fixture'),
    }
    mocks.readFile.mockResolvedValue(JSON.stringify([project]))
    mocks.lstat.mockResolvedValue({ isSymbolicLink: () => false })
    mocks.trashItem.mockRejectedValue(Object.assign(new Error('busy'), { code: 'EBUSY' }))
    await expect(caller().delete({ id: project.id })).rejects.toThrow('Close its terminal')
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
  it('trashes a registered folder and keeps its entry when trash fails', async () => {
    const project = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      name: 'delete-fixture',
      path: resolve('delete-fixture'),
    }
    mocks.readFile.mockResolvedValue(JSON.stringify([project]))
    mocks.lstat.mockResolvedValue({ isSymbolicLink: () => false })
    mocks.trashItem.mockRejectedValueOnce(new Error('Folder locked'))
    await expect(caller().delete({ id: project.id })).rejects.toThrow('Folder locked')
    expect(mocks.writeFile).not.toHaveBeenCalled()
    await caller().delete({ id: project.id })
    expect(mocks.trashItem).toHaveBeenLastCalledWith(project.path)
    expect(mocks.writeFile).toHaveBeenCalledWith(expect.stringContaining('projects.json.tmp'), '[]', 'utf8')
    mocks.readFile.mockResolvedValue('[]')
    mocks.trashItem.mockClear()
    await expect(caller().delete({ id: project.id })).rejects.toThrow('Unknown local project')
    expect(mocks.trashItem).not.toHaveBeenCalled()
  })
  it('requires a native folder selection and handles picker cancellation', async () => {
    await expect(caller().clone({ name: 'unselected', runDev: false })).rejects.toThrow('Choose a destination')
    mocks.picker.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await caller().pickDestination()).toBeNull()
    expect(mocks.execFile).not.toHaveBeenCalled()
  })
  it('rejects subframes before reading files', async () => {
    await expect(caller(false).list()).rejects.toThrow('main frame')
    expect(mocks.readFile).not.toHaveBeenCalled()
  })
  it('rejects traversal names and unknown terminal project IDs', async () => {
    await expect(caller().clone({ name: '../escape', runDev: false })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(caller().openTerminal({ id: '123e4567-e89b-42d3-a456-426614174000', runDev: true })).rejects.toThrow(
      'Unknown local project'
    )
    expect(mocks.execFile).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.terminal).not.toHaveBeenCalled()
  })
  it('clones the fixed repository into the picked parent and persists without starting npm by default', async () => {
    const api = caller()
    await api.pickDestination()
    const result = await api.clone({ name: 'my-app', runDev: false })
    expect(mocks.execFile).toHaveBeenCalledWith(
      'git',
      ['clone', '--', 'https://github.com/iamgururaj/electron-blueprint.git', result.project.path],
      expect.objectContaining({ windowsHide: true }),
      expect.any(Function)
    )
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('projects.json.tmp'),
      expect.stringContaining('my-app'),
      'utf8'
    )
    expect(mocks.rename).toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
  it('does not overwrite an existing folder or record a failed clone', async () => {
    const api = caller()
    await api.pickDestination()
    mocks.stat.mockResolvedValueOnce({ isDirectory: () => true })
    await expect(api.clone({ name: 'existing', runDev: false })).rejects.toThrow('already exists')
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => callback(new Error('offline')))
    await expect(api.clone({ name: 'new-project', runDev: false })).rejects.toThrow('Clone failed')
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
  it('runs fixed dev commands in the saved cwd and preserves a clone when terminal launch fails', async () => {
    const api = caller()
    await api.pickDestination()
    mocks.stat.mockRejectedValueOnce(Object.assign(new Error(), { code: 'ENOENT' }))
    mocks.stat.mockResolvedValue({ isDirectory: () => true })
    mocks.terminal.mockRejectedValue(new Error('Could not open terminal'))
    const result = await api.clone({ name: 'dev-app', runDev: true })
    expect(result.warning).toContain('Could not open')
    expect(mocks.rename).toHaveBeenCalled()
    expect(mocks.terminal).toHaveBeenCalledWith(result.project.id, result.project.path, true, '/userdata')
  })
})
