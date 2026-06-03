import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';
import { registerServiceWorker } from './pwa.js';
import { scheduleIdle } from './utils/scheduleIdle.js';

if (typeof window !== 'undefined') {
  scheduleIdle(() => {
    registerServiceWorker();
  }, { timeout: 1200 });
}

const App = lazy(() => import('./App.jsx'));

function AppLoader() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-aqua-100 border-t-aqua-500" />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<AppLoader />}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
