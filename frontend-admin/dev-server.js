import { createServer } from 'vite';

async function start() {
  const server = await createServer();
  await server.listen();
  console.log('[Frontend] Vite development server is ready:');
  server.printUrls();
}

start().catch((err) => {
  console.error('[Frontend] Failed to start Vite server:', err);
  process.exit(1);
});
