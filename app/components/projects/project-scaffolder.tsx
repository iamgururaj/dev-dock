import { useState } from 'react'
import { FolderGit2, FolderOpen, LoaderCircle, Play, RefreshCw, Terminal, Trash2, X } from 'lucide-react'
import { conveyor } from '@/conveyor/client'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../ui/table'

export function ProjectScaffolder() {
  const projects = conveyor.projects.list.useQuery()
  const executions = conveyor.projects.executions.useQuery({ refetchInterval: 1500 })
  const [name, setName] = useState('my-electron-app')
  const [destination, setDestination] = useState<string | null>(null)
  const [runDev, setRunDev] = useState(false)
  const [busy, setBusy] = useState(false)
  const [operation, setOperation] = useState('')
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const validName = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)

  async function perform(action: () => Promise<void>, operation = '') {
    setBusy(true)
    setOperation(operation)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Operation failed. Try again.')
    } finally {
      setBusy(false)
      setOperation('')
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4 p-5">
      <h1 className="text-lg font-semibold tracking-tight">Project Scaffolder</h1>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy || !destination || !validName) return
          void perform(async () => {
            setMessage('Scaffolding…')
            const result = await conveyor.projects.clone({ name, runDev })
            await projects.refetch()
            await executions.refetch()
            setMessage(result.warning ? `Scaffolded. ${result.warning}` : `Scaffolded ${result.project.name}.`)
          }, 'scaffold')
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              title="1–64 letters, numbers, hyphens or underscores; start with a letter or number."
            />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="project-directory">Directory</Label>
            <div className="flex items-center gap-1.5">
              <Button
                id="project-directory"
                type="button"
                variant="outline"
                className="min-w-0 flex-1 justify-start"
                title={destination ?? 'Choose parent directory'}
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const path = await conveyor.projects.pickDestination()
                    if (path) setDestination(path)
                  })
                }
              >
                <FolderOpen />
                <span className="truncate">{destination ?? 'Choose directory'}</span>
              </Button>
              {destination && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Clear directory"
                  aria-label="Clear directory"
                  disabled={busy}
                  onClick={() => setDestination(null)}
                >
                  <X />
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={runDev}
              disabled={busy}
              onChange={(event) => setRunDev(event.target.checked)}
            />
            Run npm i &amp; dev
          </label>
          <Button type="submit" disabled={busy || !destination || !validName}>
            <FolderGit2 />
            Scaffold
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div role="status" className="text-xs text-muted-foreground empty:hidden">
        {message}
      </div>
      <section className="space-y-2" aria-labelledby="local-projects-heading">
        <div className="flex items-center justify-between">
          <h2 id="local-projects-heading" className="text-sm font-semibold">
            Local Projects
          </h2>
          <Button
            variant="ghost"
            size="xs"
            disabled={busy || projects.isFetching}
            onClick={() => void projects.refetch()}
          >
            <RefreshCw className={projects.isFetching ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        </div>
        {(projects.isError || executions.isError) && (
          <p role="alert" className="text-xs text-destructive">
            Could not load projects or execution status. Retry Refresh.
          </p>
        )}
        <div className="min-w-0 border border-border">
          <Table className="w-full text-left text-xs [&_tr>:nth-child(n+6)]:sticky [&_tr>:nth-child(n+6)]:z-10 [&_tr>:nth-child(n+6)]:bg-background [&_tr>:nth-child(n+6)]:w-24 [&_tr>:nth-child(n+6)]:min-w-24 [&_tr>:nth-child(n+6)]:max-w-24 [&_tr>:nth-last-child(3)]:right-48 [&_tr>:nth-last-child(3)]:border-l [&_tr>:nth-last-child(2)]:right-24 [&_tr>:nth-child(8)]:right-0">
            <TableHeader className="bg-muted/50 text-muted-foreground">
              <TableRow>
                {[
                  'Project Name',
                  'Folder Path',
                  'Size (MB)',
                  'Scaffold Created',
                  'Folder Created',
                  'Open Terminal',
                  'Run Dev',
                  'Delete',
                ].map((heading) => (
                  <TableHead key={heading} className="px-2 py-1.5 font-medium whitespace-nowrap">
                    {heading}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.data
                ?.filter((project) => !deletedIds.includes(project.id))
                .map((project) => {
                  const execution = executions.data?.find((entry) => entry.id === project.id)
                  const running =
                    execution && ['opening', 'installing', 'starting', 'running'].includes(execution.state)
                  return (
                    <TableRow key={project.id} className="border-t border-border">
                      <TableCell className="px-2 py-1.5 font-medium whitespace-nowrap">
                        {project.name}
                        {operation === project.id && (
                          <div role="status" className="mt-0.5 text-muted-foreground">
                            Moving to trash…
                          </div>
                        )}
                        {operation !== project.id && execution && (
                          <div
                            role="status"
                            className={`mt-0.5 text-[11px] font-normal ${execution.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
                          >
                            {execution.message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-64 px-2 py-1.5 text-muted-foreground">
                        <div className="truncate" title={project.path}>
                          {project.path}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {project.sizeBytes == null
                          ? '—'
                          : (project.sizeBytes / 1_000_000).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                        {project.createdAt ? new Date(project.createdAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                        {project.folderCreatedAt ? new Date(project.folderCreatedAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy}
                          title="Open terminal"
                          aria-label={`Open terminal for ${project.name}`}
                          onClick={() =>
                            void perform(async () => {
                              await conveyor.projects.openTerminal({ id: project.id, runDev: false })
                              setMessage('Terminal opened.')
                            })
                          }
                        >
                          <Terminal />
                        </Button>
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || !!running}
                          title="Run dev"
                          aria-label={`Run dev for ${project.name}`}
                          onClick={() =>
                            void perform(async () => {
                              await conveyor.projects.openTerminal({ id: project.id, runDev: true })
                              await executions.refetch()
                            })
                          }
                        >
                          <Play />
                        </Button>
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive"
                          disabled={busy}
                          title="Move project to trash"
                          aria-label={`Delete ${project.name}`}
                          onClick={() =>
                            void perform(async () => {
                              await conveyor.projects.delete({ id: project.id })
                              setDeletedIds((ids) => [...ids, project.id])
                              void projects.refetch()
                              void executions.refetch()
                              setMessage(`Moved ${project.name} to trash.`)
                            }, project.id)
                          }
                        >
                          {operation === project.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              {!projects.data?.some((project) => !deletedIds.includes(project.id)) && !projects.isError && (
                <TableRow>
                  <TableCell colSpan={8} className="px-2 py-3 text-center text-muted-foreground">
                    {projects.isPending ? 'Loading…' : 'No local projects.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
