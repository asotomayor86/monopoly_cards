import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Para desarrollo local con las funciones serverless usa `vercel dev` (sirve cliente
// + /api en un mismo origen). Si prefieres `vite` a secas, este proxy reenvía /api a
// un `vercel dev` levantado en el puerto 3000.
export default defineConfig({
  plugins: [react()],
  // base relativo: las URLs de assets en index.html quedan como
  // "./assets/index-xxx.js". Así el mismo build sirve tanto en el subdominio
  // (monopoly.gamehub.family/) como detrás del rewrite del hub
  // (gamehub.family/monopoly/). Las llamadas a /api/* se prefijan en runtime
  // dentro de socket.js (pathPrefix()).
  base: './',
  server: {
    port: 5173,
    // Permite importar `shared/` (constantes/eventos) desde fuera de la carpeta client.
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
