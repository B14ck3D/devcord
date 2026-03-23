import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const devHttps = process.env.VITE_DEV_HTTPS === '1';
const previewHttps = process.env.VITE_PREVIEW_HTTPS === '1';

export default defineConfig({
  plugins: [react(), ...(devHttps || previewHttps ? [basicSsl()] : [])],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    https: devHttps,
    proxy: {
      '/ws': {
        target: 'http://127.0.0.1:23623',
        ws: true,
      },
      '/voice': {
        target: 'http://127.0.0.1:23623',
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    https: previewHttps,
  },
});
