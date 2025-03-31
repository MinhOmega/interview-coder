import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: 'src/electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
            minify: false,
            rollupOptions: {
              external: ['electron', 'electron-updater', 'screenshot-desktop']
            }
          }
        }
      },
      {
        // Preload scripts
        entry: 'src/electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
            rollupOptions: {
              external: ['electron']
            }
          }
        },
        onstart(options) {
          options.reload();
        }
      }
    ]),
    renderer()
  ],
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 54321,
    strictPort: true,
    watch: {
      usePolling: true
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  }
}); 