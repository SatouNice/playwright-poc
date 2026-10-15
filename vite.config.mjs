import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CSP cho renderer: khi build production chi cho phep script cua chinh app.
// Che do dev phai noi long script-src vi Vite chen inline script (react-refresh).
const CSP_PROD =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'none'";
const CSP_DEV =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self' ws://localhost:5173 http://localhost:5173";

function cspPlugin() {
  return {
    name: 'inject-csp',
    transformIndexHtml(html, ctx) {
      return html.replace('__CSP__', ctx.server ? CSP_DEV : CSP_PROD);
    },
  };
}

// Renderer cua Electron duoc load bang file:// khi build production -> base phai la './'
export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [react(), cspPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
