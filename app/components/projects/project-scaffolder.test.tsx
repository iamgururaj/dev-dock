// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { it, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  clone: vi.fn(),
  picker: vi.fn(),
  refetch: vi.fn(),
  delete: vi.fn(),
  projects: [] as { id: string; name: string; path: string }[],
}))
vi.mock('@/conveyor/client', () => ({
  conveyor: {
    projects: {
      list: { useQuery: () => ({ data: mocks.projects, refetch: mocks.refetch }) },
      executions: { useQuery: () => ({ data: [], refetch: mocks.refetch }) },
      pickDestination: mocks.picker,
      clone: mocks.clone,
      delete: mocks.delete,
    },
  },
}))
import { ProjectScaffolder } from './project-scaffolder'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it('defaults to no commands and forwards the checkbox through the typed clone call', async () => {
  mocks.picker.mockResolvedValue('C:\\Projects')
  mocks.clone.mockResolvedValue({ project: { name: 'my-electron-app' }, warning: null })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<ProjectScaffolder />))
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    const scaffold = container.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(checkbox.checked).toBe(false)
    expect(scaffold.disabled).toBe(true)
    await act(async () => (container.querySelector('#project-directory') as HTMLButtonElement).click())
    expect(scaffold.disabled).toBe(false)
    await act(async () => scaffold.click())
    expect(mocks.clone).toHaveBeenLastCalledWith({ name: 'my-electron-app', runDev: false })
    await act(async () => checkbox.click())
    await act(async () => scaffold.click())
    expect(mocks.clone).toHaveBeenLastCalledWith({ name: 'my-electron-app', runDev: true })
    expect(container.querySelectorAll('th')).toHaveLength(8)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

it('shows delete progress in its row and finishes without waiting for size refresh', async () => {
  mocks.projects = [{ id: 'project-id', name: 'delete-me', path: 'C:\\Projects\\delete-me' }]
  let finish!: () => void
  mocks.delete.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve
    })
  )
  mocks.refetch.mockReturnValue(new Promise(() => {}))
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => root.render(<ProjectScaffolder />))
    await act(async () => (container.querySelector('[aria-label="Delete delete-me"]') as HTMLButtonElement).click())
    expect(container.textContent).toContain('Moving to trash…')
    expect(container.querySelector('button[type="submit"] .animate-spin')).toBeNull()
    expect(container.querySelector('[aria-label="Delete delete-me"] .animate-spin')).not.toBeNull()
    await act(async () => finish())
    expect(container.querySelector('[aria-label="Delete delete-me"]')).toBeNull()
    expect(container.textContent).toContain('Moved delete-me to trash.')
  } finally {
    await act(async () => root.unmount())
    mocks.projects = []
    mocks.refetch.mockReset()
  }
})
