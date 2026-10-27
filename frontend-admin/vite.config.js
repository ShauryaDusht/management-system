import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/admin/',
  plugins: [
    react(),
    {
      name: 'root-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/' || req.url === '') {
            res.writeHead(302, { Location: '/admin/' })
            res.end()
            return
          }
          if (req.url === '/iitgn-logo.png' || req.url === '/campus-sanchalika-logo.png') {
            req.url = `/admin${req.url}`
          }
          next()
        })
      },
    },
  ],
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
