import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Where the Express API runs (must match PORT in server/.env)
  const apiTarget = env.VITE_API_PROXY || 'http://127.0.0.1:5050';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // The browser talks to /api on the SAME origin as the React app, and Vite forwards it
      // to Express. That keeps the httpOnly login cookie simple and avoids CORS problems.
      // /socket.io carries the real-time chat (WebSocket), so it needs ws: true
      proxy: { '/api': { target: apiTarget, changeOrigin: true }, '/socket.io': { target: apiTarget, changeOrigin: true, ws: true } },
    },
    preview: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: true }, '/socket.io': { target: apiTarget, changeOrigin: true, ws: true } },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      css: false,
    },
  };
});