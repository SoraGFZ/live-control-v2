import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    target: 'chrome118',
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), 'renderer/index.html')
      }
    }
  }
});
