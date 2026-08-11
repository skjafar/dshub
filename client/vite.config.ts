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
    rollupOptions: {
      // A second entry point, not a second app: `popout.html` is the
      // deliberately scriptless document dockview opens a Daughter Window
      // onto (ADR 0004) — it needs to exist in `build/` for Tauri to bundle
      // and for dockview's own same-origin check to resolve, but nothing
      // here ever navigates to it as a page in its own right.
      input: {
        index: path.resolve(__dirname, 'index.html'),
        popout: path.resolve(__dirname, 'popout.html'),
      },
    },
  },

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
