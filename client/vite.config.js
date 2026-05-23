import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envPrefix: ['VITE_', 'REACT_APP_'],
  plugins: [react()],
  build: {
    minify: 'esbuild',
    // Enable code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database', 'firebase/storage'],
          'icons': ['lucide-react'],
          'vendor': ['react', 'react-dom']
        }
      }
    },
    // Source maps only in non-production
    sourcemap: false,
    // Target modern browsers
    target: 'esnext',
    // Optimize CSS
    cssCodeSplit: true,
  },
  server: {
    // Enable gzip compression in dev
    middlewareMode: false,
  },
  preview: {
    // Enable compression for preview
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  // Performance hints
  define: {
    __DEV__: process.env.NODE_ENV !== 'production',
  }
});
