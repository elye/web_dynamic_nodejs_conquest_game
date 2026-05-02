import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        on: {
          proxyReqWs: (_proxyReq: unknown, _req: unknown, socket: import('net').Socket) => {
            socket.on('error', () => {});
          },
          open: (_proxySocket: import('net').Socket) => {
            _proxySocket.on('error', () => {});
          },
          error: () => {},
        },
      },
    },
  },
});
