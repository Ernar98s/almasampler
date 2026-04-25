import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const certFile = fileURLToPath(new URL('./.cert/dev-cert.pem', import.meta.url));
const keyFile = fileURLToPath(new URL('./.cert/dev-key.pem', import.meta.url));
const useHttps = existsSync(certFile) && existsSync(keyFile);

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    https: useHttps
      ? {
          cert: readFileSync(certFile),
          key: readFileSync(keyFile)
        }
      : undefined
  }
});
