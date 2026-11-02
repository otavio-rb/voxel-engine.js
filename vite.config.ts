import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const engineEntry = (file: string) => fileURLToPath(new URL(`./engine/${file}`, import.meta.url));

/**
 * As páginas da referência de API são geradas (uma por módulo, por
 * `scripts/gen-api-pages.mjs`), então entram no build por varredura em vez de
 * uma lista à mão que esqueceria o próximo módulo documentado.
 */
const apiPages = (): Record<string, string> => {
  const dir = fileURLToPath(new URL('./docs/api', import.meta.url));
  const inputs: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const page = join(dir, name, 'index.html');
    if (name === 'workers') continue;
    try {
      if (statSync(page).isFile()) inputs[`docs_api_${name.replace(/-/g, '_')}`] = page;
    } catch {
      /* não é uma página de módulo */
    }
  }
  return inputs;
};

/**
 * Mesma lógica para as páginas de prosa geradas por `scripts/gen-docs-pages.mjs`
 * a partir de `docs/pages/registry.ts` — uma por subdiretório de `docs/`, bilíngue
 * num único arquivo (sem espelho em `docs/en/`), então também entram por varredura.
 */
const docsPages = (): Record<string, string> => {
  const dir = fileURLToPath(new URL('./docs', import.meta.url));
  const skip = new Set(['api', 'en', 'src']);
  const inputs: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    try {
      if (!statSync(full).isDirectory()) continue;
      const page = join(full, 'index.html');
      if (statSync(page).isFile()) inputs[`docs_${name.replace(/-/g, '_')}`] = page;
    } catch {
      /* não é uma página */
    }
  }
  return inputs;
};

export default defineConfig({
  resolve: {
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    alias: [
      { find: /^@voxel\/engine$/, replacement: engineEntry('index.ts') },
      { find: /^@voxel\/engine\/worker$/, replacement: engineEntry('worker.ts') },
      { find: /^@voxel\/engine\/chunk-worker$/, replacement: engineEntry('chunk-worker.ts') },
    ],
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        tiny: fileURLToPath(new URL('./examples/tiny-voxels/index.html', import.meta.url)),
        geo: fileURLToPath(new URL('./examples/geo-voxels/index.html', import.meta.url)),
        docs: fileURLToPath(new URL('./docs/index.html', import.meta.url)),
        docs_api: fileURLToPath(new URL('./docs/api/index.html', import.meta.url)),
        ...apiPages(),
        ...docsPages(),
      },
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws/, '')
      }
    }
  }
});
