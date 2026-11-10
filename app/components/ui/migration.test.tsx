// @vitest-environment jsdom
import { act, createRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Button } from './button'
import { Badge } from './badge'
import { Input } from './input'
import { Label } from './label'
import { Switch } from './switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
import { ScrollArea, ScrollBar } from './scroll-area'
import { Separator } from './separator'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function render(children: ReactNode) {
  await act(async () => root.render(children))
}

describe('Base UI migration', () => {
  it('keeps button refs and suppresses disabled actions', async () => {
    let clicks = 0
    const ref = createRef<HTMLButtonElement>()
    await render(
      <Button ref={ref} disabled onClick={() => clicks++}>
        Run
      </Button>
    )
    await act(async () => ref.current?.click())
    expect(ref.current?.tagName).toBe('BUTTON')
    expect(ref.current?.disabled).toBe(true)
    expect(clicks).toBe(0)
  })

  it('composes links with render rather than nesting interactive elements', async () => {
    await render(
      <>
        <Button render={<a href="#docs" />} nativeButton={false}>
          Docs
        </Button>
        <Badge render={<a href="#status" />}>Ready</Badge>
      </>
    )
    expect(container.querySelectorAll('a')).toHaveLength(2)
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('[data-slot="badge"]')?.getAttribute('href')).toBe('#status')
  })

  it('preserves labels, input editing and form values', async () => {
    await render(
      <form>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue="Lyra" />
      </form>
    )
    const input = container.querySelector('input')!
    expect(input.labels?.[0].textContent).toBe('Name')
    expect(new FormData(container.querySelector('form')!).get('name')).toBe('Lyra')
  })

  it('toggles a labeled switch and reports its checked value', async () => {
    let checked = false
    await render(
      <>
        <Label htmlFor="notifications">Notifications</Label>
        <Switch
          id="notifications"
          onCheckedChange={(value) => {
            checked = value
          }}
        />
      </>
    )
    const toggle = container.querySelector<HTMLElement>('[role="switch"]')!
    await act(async () => toggle.click())
    expect(checked).toBe(true)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.hasAttribute('data-checked')).toBe(true)
  })

  it('selects tabs with the keyboard, prevents disabled activation and links panels', async () => {
    await render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="disabled" disabled>
            Disabled
          </TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    )
    const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]')
    await act(async () => {
      tabs[0].focus()
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    // Base UI keeps disabled tabs discoverable to keyboard users without activating them.
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    await act(async () => {
      tabs[1].click()
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(document.activeElement).toBe(tabs[2])
    expect(tabs[2].getAttribute('aria-selected')).toBe('true')
    const panel = container.querySelector('[role="tabpanel"]')!
    expect(panel.textContent).toBe('Second panel')
    expect(panel.id).toBe(tabs[2].getAttribute('aria-controls'))
  })

  it('forwards vertical orientation to Base UI keyboard navigation', async () => {
    await render(
      <Tabs orientation="vertical" defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First</TabsContent>
        <TabsContent value="two">Second</TabsContent>
      </Tabs>
    )
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('vertical')
    const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]')
    await act(async () => {
      tabs[0].focus()
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(document.activeElement).toBe(tabs[1])
  })

  it('portals tooltip content and composes a single button trigger', async () => {
    await render(
      <TooltipProvider delay={0}>
        <Tooltip open>
          <TooltipTrigger render={<Button />}>Help</TooltipTrigger>
          <TooltipContent side="bottom">Helpful description</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
    expect(container.querySelectorAll('button')).toHaveLength(1)
    const popup = document.querySelector('[data-slot="tooltip-content"]')!
    expect(popup.textContent).toBe('Helpful description')
    expect(container.contains(popup)).toBe(false)
    expect(popup.getAttribute('data-side')).toBe('bottom')
  })

  it('renders scroll viewports and separator orientation with Base UI semantics', async () => {
    await render(
      <>
        <ScrollArea className="max-h-[52vh]">
          <pre>Stack trace</pre>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <Separator orientation="vertical" />
      </>
    )
    expect(container.querySelector('[data-slot="scroll-area-viewport"]')?.textContent).toBe('Stack trace')
    expect(container.querySelector('[role="separator"]')?.getAttribute('aria-orientation')).toBe('vertical')
  })
})
