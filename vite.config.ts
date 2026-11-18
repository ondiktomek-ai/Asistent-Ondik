import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Při vývoji (npm run dev) posílá volání API na server (npm run dev:server).
    proxy: { '/api': 'http://localhost:8787' },
  },
});
