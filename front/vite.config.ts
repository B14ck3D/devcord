import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

const devHttps = process.env.VITE_DEV_HTTPS === '1';
const previewHttps = process.env.VITE_PREVIEW_HTTPS === '1';
const fallbackApiUrl = 'https://devcord.ndevelopment.org/api';

export default defineConfig(({ command }) => {
  const isDesktopBuild = process.env.DEVCORD_DESKTOP_BUILD === '1';
  const rawApiUrl = (process.env.VITE_API_URL ?? '').trim();
  if (command === 'build') {
    if (!rawApiUrl || !/^https?:\/\//i.test(rawApiUrl)) {
      process.env.VITE_API_URL = fallbackApiUrl;
    }
  }
  return {
    // Web build needs absolute root assets for SPA deep-link refresh.
    // Electron packaged build needs relative assets under file:// protocol.
    base: isDesktopBuild ? './' : '/',
    build: {
      outDir: isDesktopBuild ? 'dist-desktop' : 'dist',
    },
    plugins: [react(), ...(devHttps || previewHttps ? [basicSsl()] : [])],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      https: devHttps,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:12823',
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: true,
      https: previewHttps,
      proxy: {
        '/api': { target: 'http://127.0.0.1:12823', changeOrigin: true },
      },
    },
  };
});
