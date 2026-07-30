import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Development server configuration
  server: {
    port: 3000,
    open: true,
    host: true,
  },

  // Build configuration
  build: {
    outDir: 'build',
    sourcemap: false,
    // The app only ever runs in the bundled WebView (WebView2 on Windows,
    // WKWebView on macOS, WebKitGTK on Linux). Targeting those directly avoids
    // transpiling and polyfilling for browsers that can never load this bundle.
    target: ['chrome110', 'safari15'],
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // No manualChunks: React, MUI and Emotion are mutually entangled, and forcing
    // them into separate chunks produces a chunk-initialisation cycle that throws
    // "Cannot access '…' before initialization" at runtime — a failure the build
    // itself does not catch. Vite's default splitting keeps the order correct, and
    // the panels are already code-split via React.lazy.
  },

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', '@mui/material', '@mui/icons-material'],
  },
});
