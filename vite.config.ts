import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  // monaco-vim still imports Monaco's pre-0.56 internal package paths.
  resolve: { alias: [{ find: 'monaco-editor/esm/vs', replacement: 'monaco-editor' }] },
});
