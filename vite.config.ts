import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/nearby-lifers/' : '/',
  plugins: [
    react(),
    {
      name: 'offline-shell',
      apply: 'build',
      generateBundle(_, bundle) {
        const assets = [
          ...new Set([
            'index.html',
            ...Object.keys(bundle).filter((name) => !name.endsWith('.map')),
            'favicon.svg',
            'icons.svg',
          ]),
        ]
        const template = readFileSync(
          new URL('./build/offline-worker.js', import.meta.url),
          'utf8',
        )
        const version = createHash('sha256')
          .update(assets.join('|') + template)
          .digest('hex')
          .slice(0, 16)
        const source = template
          .replace(
            '__SHELL_CACHE__',
            JSON.stringify('nearby-lifers-shell-' + version),
          )
          .replace('__ASSETS__', JSON.stringify(assets))
        this.emitFile({ type: 'asset', fileName: 'offline-worker.js', source })
      },
    },
  ],
})
