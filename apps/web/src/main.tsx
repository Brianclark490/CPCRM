/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@descope/react-sdk';
import './theme.css';
import './index.css';
import { App } from './App.js';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary.js';

const descopeProjectId = import.meta.env.VITE_DESCOPE_PROJECT_ID as string;

if (!descopeProjectId) {
  throw new Error('VITE_DESCOPE_PROJECT_ID environment variable is required');
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <AuthProvider projectId={descopeProjectId}>
        <App />
      </AuthProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
);
