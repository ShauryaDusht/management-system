import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: 'all',
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: 'all',
  },
})
