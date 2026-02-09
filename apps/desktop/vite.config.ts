import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { builtinModules } from 'node:module'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // Externalize all node_modules - they'll be resolved at runtime
              // This is necessary because we import from src/hub which has many Node.js dependencies
              external: [
                'electron',
                ...builtinModules,
                ...builtinModules.map(m => `node:${m}`),
                // Add specific packages that should not be bundled
                'socket.io-client',
                'uuid',
                'chokidar',
                'fast-glob',
                'linkedom',
                'undici',
                'turndown',
                '@mozilla/readability',
                'pino',
                'pino-pretty',
                'yaml',
                'json5',
                '@mariozechner/pi-agent-core',
                '@mariozechner/pi-ai',
                '@mariozechner/pi-coding-agent',
                'grammy',
              ],
            },
          },
          resolve: {
            alias: {
              // Allow importing from root src/
              '@multica/hub': path.resolve(__dirname, '../../src/hub'),
              '@multica/agent': path.resolve(__dirname, '../../src/agent'),
              '@multica/sdk': path.resolve(__dirname, '../../packages/sdk/src'),
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
})
