import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const engineEntry = (file: string) => fileURLToPath(new URL(`./engine/${file}`, import.meta.url));

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
  server: {
    hmr: {
      clientPort: 443
    },
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
