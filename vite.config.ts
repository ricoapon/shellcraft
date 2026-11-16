import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const version = env.VITE_BUILD_VERSION || 'development';
  return {
    base: env.VITE_BASE_PATH || '/',
    define: { __BUILD_VERSION__: JSON.stringify(version) },
    plugins: [
      react(),
      {
        name: 'shellcraft-build-info',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ version }, null, 2) + '\n',
          });
        },
      },
    ],
    worker: { format: 'es' },
    // monaco-vim still imports Monaco's pre-0.56 internal package paths.
    resolve: { alias: [{ find: 'monaco-editor/esm/vs', replacement: 'monaco-editor' }] },
  };
});
