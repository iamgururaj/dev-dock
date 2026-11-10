import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import { createCaller, type Router } from 'electron-conveyor/define'
import type { AppContext } from '@/conveyor/init'

const state = vi.hoisted(() => ({ data: '', selected: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => state.data, getAppPath: () => process.cwd(), on: vi.fn() },
  dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [state.selected] }) },
  shell: { openExternal: vi.fn() },
}))
vi.mock('@/lib/main/project-terminal', () => ({ openProjectTerminal: vi.fn() }))
import { workspaceModule } from '@/conveyor/modules/workspace'
const frame = {} as WebContents['mainFrame']
const sender = { mainFrame: frame, isDestroyed: () => false } as unknown as WebContents
const router = { modules: { workspace: workspaceModule } } as Router<{ workspace: typeof workspaceModule }>
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
  }).workspace
}
beforeEach(async () => {
  await mkdir(join(process.cwd(), 'node_modules', '.cache'), { recursive: true })
  state.data = await mkdtemp(join(process.cwd(), 'node_modules', '.cache', 'devdock-test-'))
  state.selected = join(state.data, 'project')
  await mkdir(state.selected)
})
afterEach(async () => {
  await rm(state.data, { recursive: true, force: true })
})
describe('workspace IPC', () => {
  it('registers a real folder once and removes only its registration', async () => {
    expect(await caller().register({ scan: false })).toBe(1)
    expect(await caller().register({ scan: false })).toBe(0)
    const entries = JSON.parse(await readFile(join(state.data, 'projects.json'), 'utf8'))
    expect(entries).toHaveLength(1)
    await caller().remove(entries[0].id)
    expect(JSON.parse(await readFile(join(state.data, 'projects.json'), 'utf8'))).toEqual([])
    expect(await readFile(join(state.data, 'projects.json'), 'utf8')).toBeTruthy()
    expect(await import('node:fs/promises').then((fs) => fs.stat(state.selected))).toMatchObject({})
  })
  it('renames and moves the whole registered project', async () => {
    await caller().register({ scan: false })
    const [project] = JSON.parse(await readFile(join(state.data, 'projects.json'), 'utf8'))
    await import('node:fs/promises').then((fs) => fs.writeFile(join(state.selected, 'marker'), 'content'))
    await caller().relocate({ id: project.id, name: 'renamed', move: false })
    const parent = join(state.data, 'destination')
    await mkdir(parent)
    state.selected = parent
    await caller().relocate({ id: project.id, move: true })
    expect(await readFile(join(parent, 'renamed', 'marker'), 'utf8')).toBe('content')
    const [updated] = JSON.parse(await readFile(join(state.data, 'projects.json'), 'utf8'))
    expect(updated.path).toBe(join(parent, 'renamed'))
    expect(updated.name).toBe('renamed')
  })
  it('rejects untrusted frames and unknown project IDs', async () => {
    await expect(caller(false).register({ scan: false })).rejects.toThrow('Main frame required')
    await expect(caller().get('123e4567-e89b-42d3-a456-426614174000')).rejects.toThrow('no longer registered')
  })
  it('persists configuration and rejects unsafe URLs', async () => {
    await caller().register({ scan: false })
    const [p] = JSON.parse(await readFile(join(state.data, 'projects.json'), 'utf8'))
    const config = {
      commands: [{ id: '123e4567-e89b-42d3-a456-426614174000', name: 'Dev', value: 'npm run dev' }],
      urls: [],
      notes: 'Setup',
    }
    await caller().save({ id: p.id, config })
    expect(await caller().get(p.id)).toEqual(config)
    await expect(caller().openUrl('file:///etc/passwd')).rejects.toThrow()
  })
})
