import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envPrefix: ['VITE_', 'REACT_APP_'],
  plugins: [react()],
  build: {
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            if (id.includes('/src/utils/calls.js') || id.includes('/src/utils/iceServers.js')) {
              return 'calls';
            }
            if (id.includes('/src/features/chat/ChatPanel')) return 'chat';
            return undefined;
          }
          if (id.includes('firebase/auth')) return 'firebase-auth';
          if (id.includes('firebase/firestore')) return 'firebase-firestore';
          if (id.includes('firebase/database')) return 'firebase-rtdb';
          if (id.includes('firebase/storage')) return 'firebase-storage';
          if (id.includes('firebase')) return 'firebase-core';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-dom') || id.includes('react/')) return 'vendor';
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  preview: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
