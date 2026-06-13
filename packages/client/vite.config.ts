import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 部署在子路径（/<repo>/）下：CI 里设 DEPLOY_BASE=/Battle_DND/。
  // 本地 dev/build 不设则为根路径，行为不变。
  base: process.env.DEPLOY_BASE ?? '/',
  plugins: [react()],
  server: { port: 5173 },
});
