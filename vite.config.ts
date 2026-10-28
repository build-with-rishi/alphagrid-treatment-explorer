import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const privateCatalogPath = resolve(dirname(fileURLToPath(import.meta.url)), 'data/catalog.local.json')
const publicCatalogPath = resolve(dirname(fileURLToPath(import.meta.url)), 'public/data/catalog.json')

const privateCatalogDevEndpoint = {
  name: 'alphagrid-private-catalog-dev-endpoint',
  apply: 'serve' as const,
  configureServer(server: { middlewares: { use: (path: string, handler: (request: unknown, response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use('/data/catalog.local.json', (_request, response, next) => {
      if (!existsSync(privateCatalogPath)) return next()
      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      response.end(readFileSync(privateCatalogPath, 'utf-8'))
    })
  },
}

const publicCatalogBuildGuard = {
  name: 'alphagrid-public-catalog-build-guard',
  apply: 'build' as const,
  buildStart() {
    const publicCatalog = JSON.parse(readFileSync(publicCatalogPath, 'utf-8')) as {
      includesRestrictedData?: boolean
      cells?: Array<{ incidencePoint?: number | null; incidenceLow?: number | null; incidenceHigh?: number | null; mortalityPoint?: number | null; fiveYearPrevalence?: number | null }>
      countryCancerBurden?: Array<Record<string, unknown>>
    }
    const containsIncidence = publicCatalog.cells?.some((cell) =>
      cell.incidencePoint != null || cell.incidenceLow != null || cell.incidenceHigh != null || cell.mortalityPoint != null || cell.fiveYearPrevalence != null,
    )
    const containsCountryBurden = publicCatalog.countryCancerBurden?.some((row) =>
      Object.entries(row).some(([key, value]) => key !== 'year' && typeof value === 'number'),
    )
    if (publicCatalog.includesRestrictedData !== false || containsIncidence || containsCountryBurden || !Array.isArray(publicCatalog.cells) || !Array.isArray(publicCatalog.countryCancerBurden)) {
      throw new Error('Production build refused: public/data/catalog.json is not explicitly public-safe')
    }
  },
}

export default defineConfig({
  plugins: [react(), privateCatalogDevEndpoint, publicCatalogBuildGuard],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    css: true,
    globals: true,
  },
})
