import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';
import { captureInstallPrompt, registerServiceWorker } from './pwa.js';

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', captureInstallPrompt);
}

registerServiceWorker().catch(console.error);

const App = lazy(() => import('./App.jsx'));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={
        <main className="grid min-h-dvh place-items-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-aqua-100 border-t-aqua-500" />
        </main>
      }>
        <App />
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
