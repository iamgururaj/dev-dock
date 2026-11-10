import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'

// Shared alias configuration
const aliases = {
  '@/app': resolve(__dirname, 'app'),
  '@/lib': resolve(__dirname, 'lib'),
  '@/conveyor': resolve(__dirname, 'conveyor'),
  '@/resources': resolve(__dirname, 'resources'),
}

export default defineConfig({
  main: {
    build: {
      // Ship the used runtime code in the bundle instead of entire npm packages.
      // Electron and Node built-ins remain external automatically.
      externalizeDeps: false,
      minify: true,
      license: { fileName: 'THIRD-PARTY-LICENSES.md' },
      rollupOptions: {
        external: ['original-fs'],
        input: {
          main: resolve(__dirname, 'lib/main/main.ts'),
        },
      },
    },
    resolve: {
      alias: aliases,
    },
  },
  preload: {
    build: {
      // Sandboxed preloads can require Electron, but cannot load npm packages.
      externalizeDeps: false,
      minify: true,
      license: { fileName: 'THIRD-PARTY-LICENSES.md' },
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'lib/preload/preload.ts'),
        },
      },
    },
    resolve: {
      alias: aliases,
    },
  },
  renderer: {
    root: './app',
    build: {
      license: { fileName: 'THIRD-PARTY-LICENSES.md' },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'app/index.html'),
        },
      },
    },
    resolve: {
      alias: aliases,
      // Insurance for local framework work: when electron-conveyor is swapped to a file:/npm-link
      // checkout it brings its own node_modules, and two React copies break context/hooks. Off the
      // registry npm already hoists one copy, so this is a no-op there.
      dedupe: ['react', 'react-dom', '@tanstack/react-query', 'zustand'],
    },
    plugins: [tailwindcss(), react()],
  },
})
