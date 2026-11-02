import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 用相對路徑，打包後 Electron 才能用 file:// 載入
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
