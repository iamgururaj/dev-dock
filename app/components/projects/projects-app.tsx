import { useEffect, useState } from 'react'
import {
  PiSquaresFour,
  PiFolder,
  PiPlus,
  PiArrowLeft,
  PiTerminal,
  PiPlay,
  PiStop,
  PiArrowSquareOut,
  PiTrash,
  PiArrowClockwise,
  PiCode,
  PiMagnifyingGlass,
} from 'react-icons/pi'
import { conveyor } from '@/conveyor/client'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ProjectScaffolder } from './project-scaffolder'

type Item = { id: string; name: string; value: string }
type Config = { commands: Item[]; urls: Item[]; notes: string; lastOpened?: string }
type Project = {
  id: string
  name: string
  path: string
  branch: string | null
  changes: number | null
  stack: string[]
  lastOpened?: string
}
const blank: Config = { commands: [], urls: [], notes: '' }

export function ProjectsApp() {
  const list = conveyor.workspace.list.useQuery()
  const executions = conveyor.workspace.executions.useQuery({ refetchInterval: 1500 })
  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem('devdock-last-project'))
  const [screen, setScreen] = useState<'projects' | 'scaffolder'>('projects')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')
  const [error, setError] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [config, setConfig] = useState<Config>(blank)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'Overview' | 'Commands' | 'URLs' | 'Notes'>('Overview')
  const [output, setOutput] = useState<string | null>(null)
  const project = list.data?.find((p) => p.id === selected)
  const runs = executions.data?.filter((e) => e.projectId === selected) ?? []
  useEffect(() => {
    if (!selected) return
    let active = true
    conveyor.workspace
      .get(selected)
      .then((c) => {
        if (active) {
          setConfig(c)
          setLoadedId(selected)
        }
      })
      .catch((e) => {
        if (active) setError(String(e))
      })
    return () => {
      active = false
    }
  }, [selected])
  useEffect(() => {
    if (list.data && selected && !list.data.some((p) => p.id === selected)) {
      setSelected(null)
      localStorage.removeItem('devdock-last-project')
    }
  }, [list.data, selected])
  async function action(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  async function update(next: Config) {
    if (!selected) return
    await conveyor.workspace.save({ id: selected, config: next })
    setConfig(next)
  }
  function open(p: Project) {
    void action(async () => {
      await conveyor.workspace.opened(p.id)
      setLoadedId(null)
      setSelected(p.id)
      setTab('Overview')
      localStorage.setItem('devdock-last-project', p.id)
      await list.refetch()
    })
  }
  const filtered = [...(list.data ?? [])]
    .filter((p) => `${p.name} ${p.path} ${p.stack.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : (b.lastOpened ?? '').localeCompare(a.lastOpened ?? '')
    )
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-52 shrink-0 flex-col border-r bg-card px-3 py-5">
        <div className="mb-7 px-2 text-base font-semibold tracking-tight">
          <span className="text-brand">◆</span> DevDock
        </div>
        <nav aria-label="Main navigation" className="space-y-1 text-sm">
          <button
            className={`flex w-full items-center gap-3 px-3 py-2 text-left ${screen === 'projects' ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => {
              setScreen('projects')
              setSelected(null)
              localStorage.removeItem('devdock-last-project')
            }}
          >
            <PiSquaresFour /> Projects
          </button>
          <button
            className={`flex w-full items-center gap-3 px-3 py-2 text-left ${screen === 'scaffolder' ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => setScreen('scaffolder')}
          >
            <PiFolder /> Project Scaffolder
          </button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        {screen === 'scaffolder' ? (
          <ProjectScaffolder />
        ) : (
          <div className="mx-auto max-w-7xl p-6 lg:p-8">
            {error && (
              <div
                role="alert"
                className="mb-4 border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
                <button className="float-right" onClick={() => setError('')} aria-label="Dismiss error">
                  ×
                </button>
              </div>
            )}
            {!project ? (
              <>
                <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-widest text-brand">Workspace</p>
                    <h1 className="text-2xl font-semibold">Projects</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Your local projects, ready to work on.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        void action(async () => {
                          await conveyor.workspace.register({ scan: true })
                          await list.refetch()
                        })
                      }
                    >
                      Scan folder
                    </Button>
                    <Button
                      onClick={() =>
                        void action(async () => {
                          await conveyor.workspace.register({ scan: false })
                          await list.refetch()
                        })
                      }
                    >
                      <PiPlus /> Add Project
                    </Button>
                  </div>
                </header>
                <div className="mb-5 flex items-center gap-2">
                  <div className="relative max-w-sm flex-1">
                    <PiMagnifyingGlass className="absolute top-2.5 left-3 text-muted-foreground" />
                    <Input
                      aria-label="Search projects"
                      placeholder="Search projects or paths…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <select
                    aria-label="Sort projects"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="h-9 border bg-background px-2 text-sm"
                  >
                    <option value="recent">Recently opened</option>
                    <option value="name">Name</option>
                  </select>
                  <Button variant="ghost" size="icon" aria-label="Refresh projects" onClick={() => void list.refetch()}>
                    <PiArrowClockwise />
                  </Button>
                </div>
                {list.isError && (
                  <p role="alert" className="text-destructive">
                    Could not load projects. Try refreshing.
                  </p>
                )}
                {list.isPending ? (
                  <p className="text-sm text-muted-foreground">Loading projects…</p>
                ) : filtered.length === 0 ? (
                  <div className="border border-dashed p-12 text-center text-sm text-muted-foreground">
                    {search
                      ? 'No projects match your search.'
                      : 'No projects registered. Add a folder or scan a directory to get started.'}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((p) => (
                      <article key={p.id} className="min-w-0 border bg-card p-4">
                        <button className="w-full text-left" onClick={() => open(p)}>
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center bg-brand-soft text-brand">
                              <PiFolder size={20} />
                            </div>
                            <div className="min-w-0">
                              <h2 className="truncate font-semibold">{p.name}</h2>
                              <p className="truncate text-xs text-muted-foreground" title={p.path}>
                                {p.path}
                              </p>
                            </div>
                          </div>
                        </button>
                        <div className="mt-5 flex flex-wrap gap-1.5 text-xs">
                          {p.stack.length ? (
                            p.stack.map((s) => (
                              <span key={s} className="bg-muted px-2 py-1">
                                {s}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">Stack not detected</span>
                          )}
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                          <span>{p.branch ? `${p.branch} · ${p.changes} changes` : 'Git unavailable'}</span>
                          <span>{p.lastOpened ? new Date(p.lastOpened).toLocaleDateString() : 'Never opened'}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-1">
                          <Button size="xs" onClick={() => open(p)}>
                            Open Workspace
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Open in VS Code"
                            aria-label={`Open ${p.name} in VS Code`}
                            onClick={() => void action(() => conveyor.workspace.editor({ id: p.id, editor: 'code' }))}
                          >
                            <PiCode />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Open in Zed"
                            aria-label={`Open ${p.name} in Zed`}
                            onClick={() => void action(() => conveyor.workspace.editor({ id: p.id, editor: 'zed' }))}
                          >
                            Z
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Open terminal"
                            aria-label={`Open terminal for ${p.name}`}
                            onClick={() => void action(() => conveyor.workspace.terminal(p.id))}
                          >
                            <PiTerminal />
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setRenameId(p.id)
                              setRenameName(p.name)
                            }}
                          >
                            Rename
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              void action(async () => {
                                await conveyor.workspace.relocate({ id: p.id, move: true })
                                await list.refetch()
                              })
                            }
                          >
                            Move
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="ml-auto text-muted-foreground"
                            title="Remove registration"
                            aria-label={`Remove ${p.name} registration`}
                            onClick={() => {
                              if (window.confirm(`Remove ${p.name} from DevDock? Its folder will not be deleted.`))
                                void action(async () => {
                                  await conveyor.workspace.remove(p.id)
                                  await list.refetch()
                                })
                            }}
                          >
                            <PiTrash />
                          </Button>
                        </div>
                        {renameId === p.id && (
                          <form
                            className="mt-3 flex gap-2"
                            onSubmit={(e) => {
                              e.preventDefault()
                              void action(async () => {
                                await conveyor.workspace.relocate({ id: p.id, name: renameName.trim(), move: false })
                                setRenameId(null)
                                await list.refetch()
                              })
                            }}
                          >
                            <Input
                              aria-label="New project folder name"
                              value={renameName}
                              onChange={(e) => setRenameName(e.target.value)}
                              required
                            />
                            <Button size="xs" type="submit">
                              Save
                            </Button>
                            <Button size="xs" variant="ghost" type="button" onClick={() => setRenameId(null)}>
                              Cancel
                            </Button>
                          </form>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : loadedId !== project.id ? (
              <p className="mt-6 text-sm text-muted-foreground">Loading workspace…</p>
            ) : (
              <>
                <button
                  className="mb-5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSelected(null)
                    localStorage.removeItem('devdock-last-project')
                  }}
                >
                  <PiArrowLeft /> All projects
                </button>
                <header className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold">{project.name}</h1>
                    <p className="mt-1 truncate text-sm text-muted-foreground" title={project.path}>
                      {project.path}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {project.stack.join(' · ') || 'Stack not detected'} <span className="mx-2">/</span>{' '}
                      {project.branch ? `${project.branch} · ${project.changes} changes` : 'Git unavailable'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void action(() => conveyor.workspace.editor({ id: project.id, editor: 'code' }))}
                    >
                      VS Code
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void action(() => conveyor.workspace.editor({ id: project.id, editor: 'zed' }))}
                    >
                      Zed
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void action(() => conveyor.workspace.terminal(project.id))}
                    >
                      <PiTerminal /> Terminal
                    </Button>
                    <Button
                      size="sm"
                      disabled={!config.commands.length}
                      onClick={() =>
                        void action(async () => {
                          for (const c of config.commands)
                            if (!runs.some((r) => r.key.endsWith(`:${c.id}`) && r.status === 'running'))
                              await conveyor.workspace.start({ projectId: project.id, commandId: c.id })
                          await executions.refetch()
                        })
                      }
                    >
                      <PiPlay /> Start All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!runs.some((r) => r.status === 'running')}
                      onClick={() =>
                        void action(async () => {
                          for (const c of config.commands)
                            await conveyor.workspace.stop({ projectId: project.id, commandId: c.id })
                          await executions.refetch()
                        })
                      }
                    >
                      <PiStop /> Stop All
                    </Button>
                  </div>
                </header>
                <nav className="mt-7 flex gap-5 overflow-x-auto border-b text-sm" aria-label="Workspace sections">
                  {(['Overview', 'Commands', 'URLs', 'Notes'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`border-b-2 pb-3 whitespace-nowrap ${tab === t ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground'}`}
                    >
                      {t}
                    </button>
                  ))}
                </nav>
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="space-y-6">
                    {(tab === 'Overview' || tab === 'Commands') && (
                      <Section title="Commands" count={config.commands.length}>
                        <ItemForm
                          label="command"
                          placeholder="e.g. npm run dev"
                          onAdd={(name, value) =>
                            update({
                              ...config,
                              commands: [...config.commands, { id: crypto.randomUUID(), name, value }],
                            })
                          }
                          onError={setError}
                        />
                        {config.commands.length === 0 && <Empty text="No commands yet. Add one to run it here." />}
                        {config.commands.map((c) => {
                          const run = runs.find((r) => r.key.endsWith(`:${c.id}`))
                          return (
                            <div key={c.id} className="flex items-center gap-2 border-t py-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium">
                                  {c.name}{' '}
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    {run?.status ?? 'stopped'}
                                  </span>
                                </div>
                                <code className="block truncate text-xs text-muted-foreground">{c.value}</code>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title={run?.status === 'running' ? 'Stop' : 'Run'}
                                onClick={() =>
                                  void action(async () => {
                                    if (run?.status === 'running')
                                      await conveyor.workspace.stop({ projectId: project.id, commandId: c.id })
                                    else await conveyor.workspace.start({ projectId: project.id, commandId: c.id })
                                    await executions.refetch()
                                  })
                                }
                              >
                                {run?.status === 'running' ? <PiStop /> : <PiPlay />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title="View output"
                                disabled={!run}
                                onClick={() => setOutput(run?.key ?? null)}
                              >
                                <PiTerminal />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title="Remove command"
                                disabled={run?.status === 'running'}
                                onClick={() =>
                                  void action(() =>
                                    update({ ...config, commands: config.commands.filter((i) => i.id !== c.id) })
                                  )
                                }
                              >
                                <PiTrash />
                              </Button>
                            </div>
                          )
                        })}
                      </Section>
                    )}
                  </div>
                  <div className="space-y-6">
                    {(tab === 'Overview' || tab === 'URLs') && (
                      <Section title="Quick URLs" count={config.urls.length}>
                        <ItemForm
                          label="URL"
                          placeholder="https://localhost:3000"
                          onAdd={(name, value) => {
                            const u = new URL(value)
                            if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Use an HTTP or HTTPS URL.')
                            return update({
                              ...config,
                              urls: [...config.urls, { id: crypto.randomUUID(), name, value }],
                            })
                          }}
                          onError={setError}
                        />
                        {config.urls.length === 0 && <Empty text="No URLs yet. Add a link for quick access." />}
                        {config.urls.map((u) => (
                          <div key={u.id} className="flex items-center gap-2 border-t py-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{u.name}</div>
                              <div className="truncate text-xs text-muted-foreground">{u.value}</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Open URL"
                              onClick={() => void action(() => conveyor.workspace.openUrl(u.value))}
                            >
                              <PiArrowSquareOut />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Remove URL"
                              onClick={() =>
                                void action(() => update({ ...config, urls: config.urls.filter((i) => i.id !== u.id) }))
                              }
                            >
                              <PiTrash />
                            </Button>
                          </div>
                        ))}
                      </Section>
                    )}
                    {(tab === 'Overview' || tab === 'Notes') && (
                      <Section title="Project notes">
                        <textarea
                          aria-label="Project notes"
                          className="min-h-28 w-full resize-y border bg-background p-2 text-sm"
                          placeholder="Setup instructions and useful information…"
                          value={config.notes}
                          onChange={(e) => setConfig({ ...config, notes: e.target.value })}
                          onBlur={() => void action(() => update(config))}
                        />
                      </Section>
                    )}
                  </div>
                </div>
                {runs.length > 0 && (
                  <section className="mt-6 border-t pt-5">
                    <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
                    {runs.map((r) => (
                      <button
                        key={r.key}
                        className="flex w-full justify-between border-b py-2 text-left text-xs"
                        onClick={() => setOutput(r.key)}
                      >
                        <span>
                          {r.name} · {r.status}
                        </span>
                        <span className="text-muted-foreground">{new Date(r.started).toLocaleString()}</span>
                      </button>
                    ))}
                  </section>
                )}
                {output && (
                  <section className="mt-5 border bg-card">
                    <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
                      Output{' '}
                      <button className="text-muted-foreground" onClick={() => setOutput(null)}>
                        Close
                      </button>
                    </div>
                    <pre className="max-h-64 overflow-auto p-3 text-xs whitespace-pre-wrap">
                      {runs.find((r) => r.key === output)?.output || 'No output yet.'}
                    </pre>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
      </div>
      {children}
    </section>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="border-t py-4 text-xs text-muted-foreground">{text}</p>
}
function ItemForm({
  label,
  placeholder,
  onAdd,
  onError,
}: {
  label: string
  placeholder: string
  onAdd: (name: string, value: string) => Promise<void>
  onError: (error: string) => void
}) {
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  if (!show)
    return (
      <Button variant="outline" size="xs" className="mb-3" onClick={() => setShow(true)}>
        <PiPlus /> Add {label}
      </Button>
    )
  return (
    <form
      className="mb-3 space-y-2 border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void Promise.resolve()
          .then(() => onAdd(name.trim(), value.trim()))
          .then(() => {
            setName('')
            setValue('')
            setShow(false)
          })
          .catch((e) => onError(e instanceof Error ? e.message : String(e)))
      }}
    >
      <Input
        aria-label={`${label} name`}
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
      />
      <div className="flex gap-2">
        <Button size="xs" type="submit">
          Save
        </Button>
        <Button variant="ghost" size="xs" type="button" onClick={() => setShow(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
