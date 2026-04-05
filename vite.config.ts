import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // Prioritise .ts over .js so new TypeScript files shadow the old JS ones
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
});
