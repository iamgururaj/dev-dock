import { cn } from '@/lib/utils'
import { STACK } from './stack'
import { FolderGit2 } from 'lucide-react'

/** Stack navigation: one row per entry. */
export function Sidebar({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <nav className="flex w-59 flex-none flex-col border-r border-border bg-card pt-5 pb-3.5">
      <div className="flex flex-col gap-px px-2">
        <button
          onClick={() => onSelect('scaffolder')}
          aria-current={active === 'scaffolder' ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2.75 px-2.5 py-2.25 text-[13px] transition-colors',
            active === 'scaffolder'
              ? 'bg-brand-soft text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <FolderGit2 className="size-3.5 flex-none text-brand" />
          Project Scaffolder
        </button>
        {STACK.map((entry) => {
          const isActive = active === entry.id
          const Icon = entry.icon
          return (
            <button
              key={entry.id}
              onClick={() => onSelect(entry.id)}
              className={cn(
                'relative flex items-center gap-2.75 rounded-none px-2.5 py-2.25 text-[13px] transition-colors',
                isActive
                  ? 'bg-brand-soft text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer'
              )}
            >
              <Icon className={cn('size-3.5 flex-none', isActive ? 'text-brand' : 'text-muted-foreground/50')} />
              {entry.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
