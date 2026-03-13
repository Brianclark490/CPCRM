import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  if (mode === 'production') {
    const descopeProjectId = env.VITE_DESCOPE_PROJECT_ID || process.env.VITE_DESCOPE_PROJECT_ID;
    if (!descopeProjectId) {
      throw new Error(
        'VITE_DESCOPE_PROJECT_ID is required for production builds.\n' +
          'In CI/CD: set VITE_DESCOPE_PROJECT_ID as an environment secret.\n' +
          'Locally: copy apps/web/.env.example to apps/web/.env.local and set your Descope project ID.\n' +
          'See docs/authentication/descope-setup.md for setup instructions.',
      );
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
        },
      },
    },
  };
});
