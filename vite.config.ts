import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  // Preserve the WASM loader's relative imports instead of prebundling its lazy chunks.
  optimizeDeps: {
    exclude: [
      '@jitl/quickjs-wasmfile-release-sync',
      '@jitl/quickjs-wasmfile-release-asyncify',
      '@jitl/quickjs-wasmfile-debug-sync',
      '@jitl/quickjs-wasmfile-debug-asyncify',
    ],
  },
  // monaco-vim still imports Monaco's pre-0.56 internal package paths.
  resolve: { alias: [{ find: 'monaco-editor/esm/vs', replacement: 'monaco-editor' }] },
});
