import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: [
        'node:crypto',
        'node:util',
        'node:sqlite',
        'node:http',
        'node:fs',
        'node:path',
        'express',
      ],
    },
  },
  ssr: {
    noExternal: false,
  },
});