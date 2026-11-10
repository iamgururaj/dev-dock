---
name: lean-ui
description: Build or refine compact React interfaces using TypeScript, Tailwind CSS v4, Base UI, and shadcn Lyra. Use for forms, tables, navigation, and other product UI where minimal layout and essential information are priorities.
---

# Lean UI

Build minimal UI with essential information and maximum usability. Apply these preferences within the requested scope and existing project conventions; do not migrate an unrelated stack or redesign unrelated screens.

## Stack

- React, TypeScript, Tailwind CSS v4, Base UI.
- shadcn Lyra (`base-lyra`), shared CSS variables, light/dark support.
- Components: shadcn first, ReUI fallback.
- Icons: Lucide first, React Icons fallback.

## Design

- Keep layouts minimal, clean and compact.
- Show only essential information; avoid verbose text.
- Use 2-column forms where appropriate; stack fields when space is limited.
- Keep spacing, sizing, typography and borders consistent.
- Use compact tables with minimal row heights while preserving readable text and usable controls.
- Right-align primary actions where appropriate.
- Place related options immediately before the primary action in the same right-aligned group.
- Add apt icons to buttons; give icon-only actions a short tooltip or hint and an accessible name.
- Avoid unnecessary cards, whitespace and decoration.
- Prefer concise labels, tooltips and feedback. Keep required instructions and errors visible.
- Preserve responsive layouts, keyboard access, visible focus and accessible names.

## Code

- Reuse existing components and theme tokens, including light/dark variants.
- Keep shared components in the common UI layer; keep feature-specific components near their feature.
- Build typed, reusable components without premature abstractions.
- Avoid duplicate components and unnecessary dependencies.
- Follow existing project conventions.
